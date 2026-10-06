"""Stage 3: statement snapshots, historical holds, imports and edited exports."""
import copy
import json
import os
import time
from datetime import timedelta

import pytest

from conftest import (Api, burst, err, fixture, new_key, ok, seeded_total, ts, user)
from edits import get_at, paths_of, record_holding, set_at
from s2 import auth, authorize, auths_list, capture, fixture2, hours, me, void
from s3 import (ago, at, before, correct, full_statement, later, me_at, pay_rec, revisions,
                statement)

STAGE_URLS = {int(k.split("_")[1]): v for k, v in os.environ.items()
              if k.startswith("STAGE_") and k.endswith("_URL") and v}


@pytest.fixture
def w(make_world):
    return make_world(fixture2(operators=["u_ada"]))


# ---- snapshots --------------------------------------------------------------------------------

@pytest.fixture
def five(w):
    for i in range(5):
        ok(w.ada.pay("bob", 10 + i), 201)
    return w


@pytest.mark.req("S3-045", "S3-046", "S3-049")
def test_snapshot_pages_the_frozen_result(five):
    """S3-045 "Every first `GET /statement` response additionally returns an opaque `snapshot`
    token. It freezes ..."; S3-046 pages "that exact result, even after payments or corrections";
    S3-049 has_more at the end and beyond."""
    w = five
    first = statement(w.ada, limit=2)
    tok = first["snapshot"]
    assert isinstance(tok, str) and tok
    full = statement(w.ada)
    pid = full["entries"][0]["payment"]["payment_id"]
    ok(w.ada.pay("bob", 999), 201)
    ok(correct(w.ada, pid, 1, 1, full["entries"][0]["payment"]["created_at"]), 201)
    pages = []
    for off in (0, 2, 4):
        page = ok(w.ada.get("/statement", params={"snapshot": tok, "limit": 2, "offset": off}), 200)
        assert page["opening_balance"] == first["opening_balance"]
        assert page["closing_balance"] == first["closing_balance"]
        assert page["has_more"] is (off < 4)
        pages += page["entries"]
    assert pages == full["entries"]
    for off in (5, 50):
        page = ok(w.ada.get("/statement", params={"snapshot": tok, "limit": 2, "offset": off}), 200)
        assert page["entries"] == [] and page["has_more"] is False
    now = statement(w.ada)
    assert len(now["entries"]) == 6 and now["entries"][0]["payment"]["amount"] == 1


@pytest.mark.req("S3-045")
def test_snapshot_freezes_default_to(five):
    """S3-045 freezes the "default `to` at that read": a later payment never joins the snapshot."""
    w = five
    tok = statement(w.ada, limit=1)["snapshot"]
    ok(w.ada.pay("bob", 1), 201)
    page = ok(w.ada.get("/statement", params={"snapshot": tok, "limit": 200}), 200)
    assert len(page["entries"]) == 5 and page["closing_balance"] == 10000 - sum(range(10, 15))


@pytest.mark.req("S3-047")
@pytest.mark.parametrize("extra", [{"from": "2026-01-01T00:00:00Z"}, {"to": "2030-01-01T00:00:00Z"},
                                   {"known_at": "2030-01-01T00:00:00Z"}])
def test_snapshot_with_window_params(five, extra):
    """S3-047 "supplying `from`, `to` or `known_at` with it gives 422 `validation_failed`." """
    tok = statement(five.ada)["snapshot"]
    err(five.ada.get("/statement", params={"snapshot": tok, **extra}), 422, "validation_failed")


@pytest.mark.req("S3-048")
def test_snapshot_not_found_cases(five, reset):
    """S3-048 "Unknown token, another user's token, or a token from before reset gives 404" """
    w = five
    tok = statement(w.ada)["snapshot"]
    err(w.ada.get("/statement", params={"snapshot": "nope"}), 404, "not_found")
    err(w.bob.get("/statement", params={"snapshot": tok}), 404, "not_found")
    ok(w.ada.get("/statement", params={"snapshot": tok}), 200)
    reset(w.fixture)
    ada = Api(w.ada.base_url, ok(Api(w.ada.base_url).login("ada@example.com"), 200)["token"])
    err(ada.get("/statement", params={"snapshot": tok}), 404, "not_found")


@pytest.mark.req("S3-050", "S3-049")
def test_snapshot_ignores_unknown_params_and_validates_paging(five):
    """S3-050 unknown parameters are ignored; S3-049 limit/offset still validated."""
    tok = statement(five.ada)["snapshot"]
    ok(five.ada.get("/statement", params={"snapshot": tok, "colour": "blue"}), 200)
    err(five.ada.get("/statement", params={"snapshot": tok, "limit": "0"}), 422, "validation_failed")
    err(five.ada.get("/statement", params={"snapshot": tok, "offset": "-1"}), 422,
        "validation_failed")


@pytest.mark.req("S3-052", "S3-046")
def test_snapshot_stable_under_concurrent_writes(five):
    """S3-052 "Existing snapshots remain unchanged during concurrent payments or corrections." """
    w = five
    first = statement(w.ada, limit=1)
    tok = first["snapshot"]
    full = statement(w.ada)["entries"]
    cs = [Api(w.ada.base_url, w.ada.token) for _ in range(10)]

    def go(i):
        if i % 2:
            return cs[i % 10].pay("bob", 1)
        return ok(cs[i % 10].get("/statement", params={"snapshot": tok, "limit": 1,
                                                       "offset": i % 5}), 200)
    try:
        out = burst(go, 40, workers=10)
    finally:
        for c in cs:
            c.close()
    for i, r in enumerate(out):
        if i % 2 == 0:
            assert r["entries"] == full[i % 5:i % 5 + 1]
            assert r["opening_balance"] == first["opening_balance"]


@pytest.mark.req("S3-067")
def test_snapshot_unchanged_after_lifecycle(w):
    """S3-067 "Old snapshots remain unchanged after any lifecycle action or correction." """
    a = ok(authorize(w.ada, "bob", 500), 201)
    ok(w.ada.pay("bob", 7), 201)
    first, entries = full_statement(w.ada)
    ok(capture(w.bob, a["authorization_id"], {"amount": 100, "final": False}), 201)
    ok(void(w.ada, a["authorization_id"]), 200)
    page = ok(w.ada.get("/statement", params={"snapshot": first["snapshot"], "limit": 200}), 200)
    assert page["entries"] == entries and page["closing_balance"] == first["closing_balance"]


# ---- historical holds ---------------------------------------------------------------------------

@pytest.mark.req("S3-058", "S3-059", "S3-063")
def test_hold_lifecycle_in_history(w):
    """S3-059 "A hold starts at authorization creation; nonfinal capture reduces it at capture
    time; final capture, void or expiry releases the remainder at that event's time." S3-058
    all four fields describe one view; S3-063 `closed_at`."""
    a = ok(authorize(w.ada, "bob", 1000), 201)
    assert a["closed_at"] is None
    time.sleep(0.05)
    c1 = ok(capture(w.bob, a["authorization_id"], {"amount": 300, "final": False}), 201)
    time.sleep(0.05)
    v = ok(void(w.ada, a["authorization_id"]), 200)
    assert v["closed_at"] is not None
    t_auth, t_cap, t_void = a["created_at"], c1["created_at"], v["closed_at"]

    def view(t):
        m = me_at(w.ada, t)
        assert m["balance"] == m["total"] and m["available"] == m["total"] - m["held"]
        return (m["total"], m["held"], m["available"])
    assert view(before(t_auth, milliseconds=1)) == (10000, 0, 10000)
    assert view(t_auth) == (10000, 1000, 9000)
    assert view(before(t_cap, milliseconds=1)) == (10000, 1000, 9000)
    assert view(t_cap) == (9700, 700, 9000)
    assert view(before(t_void, milliseconds=1)) == (9700, 700, 9000)
    assert view(t_void) == (9700, 0, 9700)
    assert auths_list(w.ada)[0]["closed_at"] is not None
    assert ts(auths_list(w.ada)[0]["closed_at"]) == ts(t_void)


@pytest.mark.req("S3-063", "S3-059")
def test_closed_at_on_final_capture_and_expiry(make_world):
    """S3-063 `closed_at` is the event time: the final capture's time, or `expires_at` for
    expiry; S3-059 "Expiry takes effect at `expires_at`." """
    w = make_world(fixture2(ttl=2))
    a = ok(authorize(w.ada, "bob", 400), 201)
    p = ok(capture(w.bob, a["authorization_id"], {"amount": 100}), 201)
    x = auths_list(w.ada)[0]
    assert ts(x["closed_at"]) == ts(p["created_at"])
    b = ok(authorize(w.ada, "cy", 250), 201)
    time.sleep(2.6)
    y = next(z for z in auths_list(w.ada) if z["authorization_id"] == b["authorization_id"])
    assert y["status"] == "expired" and ts(y["closed_at"]) == ts(b["expires_at"])
    m = me_at(w.ada, before(b["expires_at"], milliseconds=1))
    assert m["held"] == 250
    assert me_at(w.ada, b["expires_at"])["held"] == 0


@pytest.mark.req("S3-060")
def test_known_at_hides_later_events(w):
    """S3-060 "Events other than clock expiry are known at their server-assigned event time.
    Once creation is known, the expiry deadline is known too." """
    a = ok(authorize(w.ada, "bob", 1000), 201)
    time.sleep(0.05)
    v = ok(void(w.ada, a["authorization_id"]), 200)
    after = later(v["closed_at"], seconds=1)
    assert me_at(w.ada, after, known_at=before(a["created_at"], milliseconds=1))["held"] == 0
    m = me_at(w.ada, after, known_at=a["created_at"])
    assert m["held"] == 1000 and m["available"] == 9000
    assert me_at(w.ada, after, known_at=v["closed_at"])["held"] == 0
    beyond = later(a["expires_at"], seconds=1)
    assert me_at(w.ada, beyond, known_at=a["created_at"])["held"] == 0


@pytest.mark.req("S3-061")
def test_future_as_of_expires_open_holds(w):
    """S3-061 "For queries beyond now, an open hold expires at its deadline." """
    a = ok(authorize(w.ada, "bob", 1000), 201)
    assert me_at(w.ada, before(a["expires_at"], seconds=1))["held"] == 1000
    assert me_at(w.ada, a["expires_at"])["held"] == 0
    assert me_at(w.ada, later(a["expires_at"], days=1))["available"] == 10000
    assert me(w.ada)["held"] == 1000


@pytest.mark.req("S3-065")
def test_seeded_hold_times(make_world):
    """S3-065 "Seeded open holds are assumed created at reset unless `created_at` is supplied" """
    T = ago(hours=2)
    a1 = auth("a_t", "ada", "bob", 300)
    a1["created_at"] = at(T)
    w = make_world(fixture2(authorizations=[a1, auth("a_r", "ada", "cy", 200),
                                            auth("a_c", "ada", "cy", 50, status="captured")]))
    assert me_at(w.ada, before(at(T), seconds=1))["held"] == 0
    assert me_at(w.ada, later(at(T), seconds=1))["held"] == 300
    assert me_at(w.ada, ago(minutes=30))["held"] == 300
    assert me(w.ada)["held"] == 500


@pytest.mark.req("S3-064")
def test_overdraft_through_a_hold(make_world):
    """S3-064 "A correction is rejected with 409 `historical_overdraft` if it makes either total
    or available negative at any past effective/event boundary" — bob's total stays positive,
    but his available would go below zero while his hold was open."""
    w = make_world(fixture2(users=[user("ada", 10000), user("bob", 0), user("cy", 0),
                                   user("dan", 600)]))
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(authorize(w.bob, "cy", 800), 201)
    ok(w.dan.pay("bob", 600), 201)
    err(correct(w.ada, p["payment_id"], 1, 300, p["created_at"]), 409, "historical_overdraft")
    assert me(w.bob)["total"] == 1600 and me(w.bob)["held"] == 800
    ok(correct(w.ada, p["payment_id"], 1, 900, p["created_at"]), 201)


@pytest.mark.req("S3-064", "S3-034")
def test_insufficient_funds_takes_precedence(make_world):
    """S3-064 "Current unaffordable debits still take precedence as `insufficient_funds`." —
    a correction that is both unaffordable now and a historical overdraft."""
    w = make_world(fixture2(users=[user("ada", 10000), user("bob", 0), user("cy", 0)]))
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(w.bob.pay("cy", 1000), 201)
    err(correct(w.ada, p["payment_id"], 1, 0, p["created_at"]), 409, "insufficient_funds")


@pytest.mark.req("S3-066")
def test_statement_money_movements_only(w):
    """S3-066 "authorization, release and expiry are not payments." """
    a = ok(authorize(w.ada, "bob", 500), 201)
    ok(void(w.ada, a["authorization_id"]), 200)
    assert statement(w.ada)["entries"] == []
    assert statement(w.ada)["closing_balance"] == 10000


# ---- imports -------------------------------------------------------------------------------------

def make_prev_state(url, stage):
    prev = Api(url)
    fx = fixture2(operators=["u_ada"]) if stage >= 2 else fixture(operators=["u_ada"])
    ok(prev.post("/_test/reset", fx), 204)
    tok = {h: ok(prev.login(f"{h}@example.com"), 200)["token"] for h in ("ada", "bob", "cy")}
    a, b = Api(url, tok["ada"]), Api(url, tok["bob"])
    k = new_key()
    p = ok(a.pay("bob", 700, key=k, note="old"), 201)
    s = ok(a.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 30}]), 201)
    extra = {}
    if stage >= 2:
        au = ok(authorize(a, "bob", 400), 201)
        extra["cap"] = ok(capture(b, au["authorization_id"], {"amount": 150, "final": False}), 201)
        extra["auth"] = au
    snap = ok(prev.get("/_test/export"), 200)
    return snap, tok, p, k, s, extra


@pytest.mark.req("S3-056", "S3-053", "S3-022")
@pytest.mark.parametrize("stage", [1, 2])
def test_earlier_stage_exports_import(stage, api, reset):
    """S3-056 "A stage-3 service must accept exports produced by the same team's stage-1 or
    stage-2 service. The ledger must import and account for authorizations and captures." """
    url = STAGE_URLS.get(stage)
    if not url:
        pytest.skip(f"no stage-{stage} service (STAGE_{stage}_URL): run through run.sh")
    snap, tok, p, k, s, extra = make_prev_state(url, stage)
    reset(fixture2())
    ok(api().post("/_test/import", snap), 204)
    ada, bob = api(tok["ada"]), api(tok["bob"])
    replay = ok(ada.pay("bob", 700, key=k, note="old"), 200)
    for f, v in p.items():
        assert replay[f] == v, f
    r = revisions(ada, p["payment_id"])
    assert len(r) == 1 and r[0]["amount"] == 700
    assert ts(r[0]["effective_at"]) == ts(r[0]["recorded_at"]) == ts(p["created_at"])
    for m in s["payments"]:
        rm = revisions(bob, m["payment_id"])
        assert ts(rm[0]["effective_at"]) == ts(s["committed_at"])
    first, entries = full_statement(ada)
    assert first["closing_balance"] == me(ada)["total"]
    assert first["opening_balance"] + sum(e["delta"] for e in entries) == first["closing_balance"]
    if stage == 2:
        cap = extra["cap"]
        caps = [e for e in entries if e["payment"]["payment_id"] == cap["payment_id"]]
        assert len(caps) == 1 and caps[0]["delta"] == -150
        assert me(ada)["held"] == 250
        assert me_at(ada, before(extra["auth"]["created_at"], milliseconds=1))["held"] == 0
        err(correct(ada, cap["payment_id"], 1, 1, cap["created_at"]), 422, "linked_payment_immutable")
    assert me_at(ada, before(p["created_at"], milliseconds=1))["balance"] == 10000
    ok(correct(ada, p["payment_id"], 1, 600, p["created_at"]), 201)


@pytest.fixture
def corrected(w):
    w.k_pay = new_key()
    w.p = ok(w.ada.pay("bob", 1000, key=w.k_pay, note="n"), 201)
    w.k_c = new_key()
    w.c2 = ok(correct(w.ada, w.p["payment_id"], 1, 800, w.p["created_at"], reason="first", key=w.k_c), 201)
    w.c3 = ok(correct(w.ada, w.p["payment_id"], 2, 777, w.p["created_at"], reason="second"), 201)
    w.snap = ok(Api(w.ada.base_url).get("/_test/export"), 200)
    return w


@pytest.mark.req("S3-068", "S3-032")
def test_corrections_survive_import(corrected, api, reset):
    """S3-068 export/import keeps revisions and correction replays."""
    w = corrected
    revs = revisions(w.ada, w.p["payment_id"])
    st = statement(w.ada)
    reset(fixture())
    ok(api().post("/_test/import", w.snap), 204)
    assert revisions(w.ada, w.p["payment_id"]) == revs
    st2 = statement(w.ada)
    assert st2["entries"] == st["entries"] and st2["closing_balance"] == st["closing_balance"]
    assert ok(correct(w.ada, w.p["payment_id"], 1, 800, w.p["created_at"], reason="first",
                      key=w.k_c), 200) == w.c2
    assert ok(w.ada.pay("bob", 1000, key=w.k_pay, note="n"), 200) == w.p
    assert me_at(w.ada, known_at=w.c2["recorded_at"])["balance"] == 9200
    err(correct(w.ada, w.p["payment_id"], 2, 1, w.p["created_at"]), 409, "stale_revision")


def edit_import(w, api, fn):
    doc = copy.deepcopy(w.snap)
    if fn(doc["state"]) is False:
        pytest.skip("the export's state does not show this value")
    err(api().post("/_test/import", doc), 422, "validation_failed")


@pytest.mark.req("S3-068", "S1-158")
@pytest.mark.parametrize("what", ["amount_big", "amount_neg", "reason_long", "reason_empty",
                                  "receipt_amount", "receipt_reason", "receipt_revision"])
def test_edited_revisions_refused(corrected, api, what):
    """S3-068 an edited revision record or correction receipt is an invalid state (422): the
    revision "second" (777) and the receipt of the correction "first" (800)."""
    w = corrected
    old, new = {"amount_big": (777, 10 ** 9 + 1), "amount_neg": (777, -1),
                "reason_long": ("second", "x" * 201), "reason_empty": ("second", ""),
                "receipt_amount": (800, 801), "receipt_reason": ("first", "FIRST"),
                "receipt_revision": (2, 5)}[what]
    marker = "first" if what.startswith("receipt") else "second"

    def edit(state):
        recs = [r for r in record_holding(state, marker) if old in r.values()]
        if what.startswith("receipt"):
            recs = [r for r in recs if r.get("payment_id") == w.p["payment_id"] or
                    w.p["payment_id"] in r.values()]
        if not recs:
            return False
        for r in recs:
            for k, v in list(r.items()):
                if v == old and not isinstance(v, bool):
                    r[k] = new
    edit_import(w, api, edit)


@pytest.mark.req("S3-068", "S3-030")
def test_edited_revision_times_refused(corrected, api):
    """S3-068 / S3-030 the third revision's recorded time moved before the second's."""
    w = corrected
    rec2, rec3 = w.c2["recorded_at"], w.c3["recorded_at"]
    ms2, ms3 = round(ts(rec2).timestamp() * 1000), round(ts(rec3).timestamp() * 1000)

    def edit(state):
        hits = paths_of(state, lambda v: v == ms3 or v == rec3)
        if not hits:
            return False
        for p in hits:
            set_at(state, p, ms2 - 1000 if isinstance(get_at(state, p), int) else before(rec2, seconds=1))
    edit_import(w, api, edit)


@pytest.mark.req("S3-005", "S3-068")
def test_import_with_future_payment_time_refused(corrected, api):
    """S3-005 / S3-068 an imported payment time 30 days in the future is refused, like a seeded
    one (every place the instant appears is moved together)."""
    w = corrected
    ms = round(ts(w.p["created_at"]).timestamp() * 1000)

    def edit(state):
        hits = paths_of(state, lambda v: v == ms or v == w.p["created_at"])
        if not hits:
            return False
        for p in hits:
            v = get_at(state, p)
            set_at(state, p, ms + 86400000 * 30 if isinstance(v, int) else later(v, days=30))
    edit_import(w, api, edit)


@pytest.mark.req("S3-068", "S3-032", "S1-158")
@pytest.mark.parametrize("field,value", [("amount", 5), ("reason", "other"), ("revision", 9),
                                         ("payment_id", "p_ghost"),
                                         ("effective_at", "2001-01-01T00:00:00+00:00"),
                                         ("recorded_at", "2001-01-01T00:00:00+00:00")])
def test_edited_correction_receipt_fields(corrected, api, field, value):
    """S3-068 / case memory: any single field of the stored correction receipt edited: 422."""
    w = corrected

    def edit(state):
        hits = [r for r in record_holding(state, "first")
                if isinstance(r, dict) and r.get("revision") == 2 and "recorded_at" in r]
        hits = [r for r in hits if r.get("recorded_at") == w.c2["recorded_at"]]
        if not hits:
            return False
        for r in hits:
            r[field] = value
    edit_import(w, api, edit)


@pytest.mark.req("S1-013", "S3-004")
def test_large_reset_with_seeded_times(api, control):
    """S1-013 the 10 s reset limit with 1000 users and 5000 seeded payments carrying times."""
    users = [user(f"q{i}", 100000) for i in range(1000)]
    pays = [pay_rec(f"p_{i}", f"q{i % 1000}", f"q{(i + 7) % 1000}", 1 + i % 50,
                    ago(hours=1 + i % 500)) for i in range(5000)]
    t0 = time.time()
    ok(control.post("/_test/reset", fixture(users=users, payments=pays)), 204)
    assert time.time() - t0 < 10.0
    c = api(ok(api().login("q0@example.com"), 200)["token"])
    s = statement(c)
    assert s["opening_balance"] + sum(e["delta"] for e in s["entries"]) == s["closing_balance"] == 100000
