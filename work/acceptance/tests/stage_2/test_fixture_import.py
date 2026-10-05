"""Stage 2 fixture rules, export/import of the new state, stage-1 upgrade, edited-export
validity (standing probes), large resets and concurrency."""
import copy
import json
import time
from datetime import datetime, timezone

import pytest

from conftest import (Api, PASSWORD, burst, err, err_any, fixture, new_key, ok, seeded_total,
                      user)
from s2 import (PREV_BASE_URL, auth, authorize, auths_list, capture, fixture2, hours, me, void)

TWO53 = 2 ** 53


# ---- fixture ---------------------------------------------------------------------------

@pytest.mark.req("S2-093", "S2-095", "S2-092", "S2-156")
def test_seeded_holds_reduce_available(make_world):
    """S2-093 "**`available` is derived, never seeded** — the service subtracts the seeded open
    holds itself." S2-095 "Only `open` holds anything." S2-092 seeded `expires_at` is kept."""
    exp = hours(3)
    w = make_world(fixture2(authorizations=[
        auth("a_1", "ada", "bob", 2000, expires_at=exp),
        auth("a_2", "ada", "cy", 1000, status="captured"),
        auth("a_3", "ada", "cy", 700, status="voided"),
        auth("a_4", "ada", "cy", 300, status="expired", expires_at=hours(-2)),
        auth("a_5", "bob", "ada", 2500)]))
    m = me(w.ada)
    assert (m["balance"], m["total"], m["held"], m["available"]) == (10000, 10000, 2000, 8000)
    m = me(w.bob)
    assert (m["total"], m["held"], m["available"]) == (2500, 2500, 0)
    got = {a["authorization_id"]: a for a in auths_list(w.ada)}
    assert set(got) == {"a_1", "a_2", "a_3", "a_4", "a_5"}
    assert got["a_1"]["status"] == "open" and got["a_1"]["remaining_amount"] == 2000
    assert datetime.fromisoformat(got["a_1"]["expires_at"].replace("Z", "+00:00")) == \
        datetime.fromisoformat(exp)
    assert got["a_4"]["status"] == "expired"
    err(w.bob.pay("cy", 1), 409, "insufficient_funds")


@pytest.mark.req("S2-097", "S2-098", "S2-094")
def test_seeded_open_hold_already_past_expiry(make_world):
    """S2-097 "An authorization whose `expires_at` is at or before now is `expired` and holds no
    funds." A seeded `open` hold an hour in the past is expired at once — and is not counted by
    the S2-094 reset check, which concerns *unexpired* holds."""
    w = make_world(fixture2(authorizations=[auth("a_old", "cy", "bob", 5000,
                                                 expires_at=hours(-1.5))]))
    a = auths_list(w.cy)[0]
    assert a["status"] == "expired"
    m = me(w.cy)
    assert (m["held"], m["available"]) == (0, 500)
    err_any(capture(w.bob, "a_old"), {(409, "authorization_expired"),
                                      (409, "authorization_not_open")})


@pytest.mark.req("S2-094")
def test_seeded_holds_above_balance_are_a_reset_error(world, reset):
    """S2-094 "A sum of seeded unexpired open holds larger than that user's `balance` is a reset
    error: `422 validation_failed` ... changing nothing" """
    ok(world.ada.pay("bob", 10), 201)
    bad = fixture2(authorizations=[auth("a_1", "cy", "bob", 300), auth("a_2", "cy", "ada", 201)])
    err(reset(bad, expect=None), 422, "validation_failed")
    assert world.ada.balance() == 9990
    good = fixture2(authorizations=[auth("a_1", "cy", "bob", 300), auth("a_2", "cy", "ada", 200),
                                    auth("a_3", "cy", "ada", 900, status="voided")])
    reset(good)


@pytest.mark.req("S2-091", "S2-090")
@pytest.mark.parametrize("ttl", [0, -1, 1.5, "600", True, None])
def test_ttl_must_be_positive_integer(world, reset, ttl):
    """S2-091 "If supplied, it must be a positive integer number of seconds." (decision D3)"""
    fx = fixture2()
    fx["authorization_ttl_seconds"] = ttl
    err(reset(fx, expect=None), 422, "validation_failed")
    assert world.ada.balance() == 10000


@pytest.mark.req("S2-095")
@pytest.mark.parametrize("change", [{"status": "pending"}, {"status": "OPEN"},
                                    {"amount": 0}, {"amount": 1.5}, {"amount": 10 ** 9 + 1},
                                    {"from_user_id": "u_ghost"}, {"to_user_id": "u_ada"},
                                    {"expires_at": "not a time"},
                                    {"expires_at": "2026-02-30T10:00:00+00:00"},
                                    {"visibility": "x"}, {"note": "x" * 201}])
def test_bad_seeded_authorization_is_a_reset_error(world, reset, change):
    """S2-095 seeded statuses are the four listed; stage-1 amount, party, note, visibility and
    timestamp rules apply to seeded authorisations too (decision D3)."""
    a = auth("a_1", "ada", "bob", 100)
    a.update(change)
    err(reset(fixture2(authorizations=[a]), expect=None), 422, "validation_failed")
    assert world.ada.balance() == 10000


@pytest.mark.req("S2-096", "S2-090")
def test_earlier_fixture_without_authorizations(make_world):
    """S2-096 "omission means an empty list"; S2-090 default ttl 600."""
    w = make_world(fixture())
    assert auths_list(w.ada) == []
    m = me(w.ada)
    assert (m["held"], m["available"]) == (0, 10000)
    a = ok(authorize(w.ada, "bob", 1), 201)
    from conftest import ts
    assert (ts(a["expires_at"]) - ts(a["created_at"])).total_seconds() == pytest.approx(600, abs=1)


@pytest.mark.req("S2-095", "S1-025")
def test_seeded_authorization_extra_fields_ignored(make_world):
    """Stage-1 S1-025: fields outside the format (e.g. `captured_amount`, `payment_id`) are
    ignored, not read."""
    a = auth("a_1", "ada", "bob", 100)
    a.update({"captured_amount": 50, "payment_id": "p_x", "colour": 1})
    w = make_world(fixture2(authorizations=[a]))
    x = auths_list(w.ada)[0]
    assert x["status"] == "open" and x["remaining_amount"] == 100
    assert me(w.ada)["held"] == 100


# ---- export / import of the new state ------------------------------------------------------

@pytest.fixture
def rich(make_world):
    w = make_world(fixture2(operators=["u_ada"], authorizations=[
        auth("a_seed", "bob", "cy", 400, expires_at=hours(5))]))
    w.k_auth, w.k_cap = new_key(), new_key()
    w.a_open = ok(authorize(w.ada, "bob", 2000, key=w.k_auth, note="deposit"), 201)
    aid = w.a_open["authorization_id"]
    w.p_cap = ok(capture(w.bob, aid, {"amount": 700, "final": False}, key=w.k_cap), 201)
    w.a_done = ok(authorize(w.ada, "cy", 300), 201)["authorization_id"]
    ok(capture(w.cy, w.a_done, {"amount": 100}), 201)
    w.a_void = ok(authorize(w.cy, "ada", 50), 201)["authorization_id"]
    ok(void(w.cy, w.a_void), 200)
    return w


def view(w):
    return {h: (me(c), c.feed(), auths_list(c), c.requests_list()) for h, c in w.clients.items()}


@pytest.mark.req("S2-158", "S1-161", "S1-162")
def test_round_trip_preserves_authorizations(rich, api, reset):
    """S2-158 export/import preserves authorisations, holds, captures and their retries."""
    snap = ok(api().get("/_test/export"), 200)
    before = view(rich)
    reset(fixture())
    ok(api().post("/_test/import", snap), 204)
    assert view(rich) == before
    m = me(rich.ada)
    assert (m["total"], m["held"]) == (10000 - 700 - 100, 1300)
    assert ok(capture(rich.bob, rich.a_open["authorization_id"], {"amount": 700, "final": False},
                      key=rich.k_cap), 200) == rich.p_cap
    assert ok(authorize(rich.ada, "bob", 2000, key=rich.k_auth, note="deposit"), 200) == \
        rich.a_open
    assert view(rich) == before
    p = ok(capture(rich.bob, rich.a_open["authorization_id"]), 201)
    assert p["amount"] == 1300


@pytest.mark.docker
@pytest.mark.req("S2-158", "S1-155")
def test_authorizations_survive_import_into_a_fresh_container(rich, api, spawn):
    """S2-158 / S1-155 no dependency on the source process."""
    snap = ok(api().get("/_test/export"), 200)
    before = view(rich)
    url = spawn()
    other = Api(url)
    ok(other.post("/_test/import", snap), 204)
    moved = {h: Api(url, c.token) for h, c in rich.clients.items()}
    got = {h: (me(c), c.feed(), auths_list(c), c.requests_list()) for h, c in moved.items()}
    assert got == before
    for c in moved.values():
        c.close()
    other.close()


@pytest.mark.req("S2-097", "S2-158")
def test_expiry_continues_after_import(make_world, api, reset):
    """S2-097 an imported open authorisation still expires by the clock."""
    w = make_world(fixture2(ttl=3))
    aid = ok(authorize(w.ada, "bob", 4000), 201)["authorization_id"]
    snap = ok(api().get("/_test/export"), 200)
    reset(fixture())
    ok(api().post("/_test/import", snap), 204)
    assert me(w.ada)["held"] == 4000
    time.sleep(3.5)
    assert me(w.ada)["held"] == 0
    assert auths_list(w.ada)[0]["status"] == "expired"
    assert ok(authorize(w.ada, "bob", 1), 201)["authorization_id"] != aid


# ---- stage-1 export into stage 2 (API half of the upgrade) -----------------------------------

@pytest.fixture
def stage1_snapshot():
    if not PREV_BASE_URL:
        pytest.skip("no previous-stage service (PREV_BASE_URL): run through run.sh on stage-2+")
    prev = Api(PREV_BASE_URL)
    ok(prev.post("/_test/reset", fixture(operators=["u_ada"])), 204)
    ada = Api(PREV_BASE_URL, ok(prev.login("ada@example.com"), 200)["token"])
    bob = Api(PREV_BASE_URL, ok(prev.login("bob@example.com"), 200)["token"])
    s = type("S", (), {})()
    s.ada_token, s.bob_token = ada.token, bob.token
    s.pending = ok(bob.ask("ada", 1200, note="taxi"), 201)["request_id"]
    s.lost_key = new_key()
    s.lost = ok(ada.pay("bob", 333, key=s.lost_key, note="lost"), 201)   # response "lost"
    s.split = ok(ada.split(10, ["ada", "bob", "cy"]), 201)
    s.settle = ok(ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 5}]), 201)
    s.signup_token = ok(prev.signup("eve@example.com", "eve password"), 201)["token"]
    s.ada_feed = ada.feed()
    s.snap = ok(prev.get("/_test/export"), 200)
    for c in (prev, ada, bob):
        c.close()
    return s


@pytest.mark.req("S2-078", "S2-163", "S2-162", "S2-084")
def test_stage1_export_imports_into_stage2(stage1_snapshot, api, reset):
    """S2-078 "A stage-2 service must accept an export produced by the same team's stage-1
    service." Tokens, balances, pending requests and lost-payment retries carry over."""
    s = stage1_snapshot
    reset(fixture2(authorizations=[auth("a_x", "ada", "bob", 1)]))
    ok(api().post("/_test/import", s.snap), 204)
    ada, bob = api(s.ada_token), api(s.bob_token)
    m = me(ada)
    assert m["total"] == m["balance"] == m["available"] == 10000 - 333 and m["held"] == 0
    feed = ada.feed()
    assert [{k: x[k] for k in old} for x, old in zip(feed, s.ada_feed)] == s.ada_feed
    assert len(feed) == len(s.ada_feed)
    assert auths_list(ada) == []
    # S2-162: the lost payment retried with the same key and body returns the original
    replay = ok(ada.pay("bob", 333, key=s.lost_key, note="lost"), 200)
    for k, v in s.lost.items():
        assert replay[k] == v, k
    assert me(ada)["total"] == 10000 - 333
    # S2-163: the pending request is payable
    p = ok(ada.pay_request(s.pending), 201)
    assert p["request_id"] == s.pending and p["authorization_id"] is None
    ok(api(s.signup_token).get("/me"), 200)
    ok(api().login("eve@example.com", "eve password"), 200)
    # and stage-2 features work on the imported state
    ok(authorize(ada, "bob", 100), 201)
    assert me(ada)["held"] == 100


@pytest.mark.req("S2-078", "S1-161")
def test_stage1_split_and_settlement_replays_after_upgrade(stage1_snapshot, api, reset):
    """S2-078 with stage-1 §10: the stage-1 export's completed idempotent responses still
    replay after the upgrade, and a stage-1 replay matches the stage-1 body in every stage-1
    field."""
    s = stage1_snapshot
    reset(fixture())
    ok(api().post("/_test/import", s.snap), 204)
    ada = api(s.ada_token)
    r = ok(ada.pay("bob", 333, key=s.lost_key, note="lost"), 200)
    for k, v in s.lost.items():
        assert r[k] == v, k
    m = me(ada)
    assert (m["total"], m["held"], m["available"]) == (m["balance"], 0, m["balance"])
    ok(authorize(ada, "bob", 1), 201)


# ---- edited exports (standing probes; S1-158 / S2-158) --------------------------------------

def paths_of(obj, pred, path=()):
    """Every path in a JSON value whose leaf satisfies pred."""
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            out += paths_of(v, pred, path + (k,))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            out += paths_of(v, pred, path + (i,))
    elif pred(obj):
        out.append(path)
    return out


def get_at(obj, path):
    for p in path:
        obj = obj[p]
    return obj


def set_at(obj, path, value):
    get_at(obj, path[:-1])[path[-1]] = value


def record_holding(state, value):
    """The innermost dict in the state that directly holds `value` as one of its fields."""
    paths = paths_of(state, lambda v: v == value)
    return [get_at(state, p[:-1]) for p in paths if isinstance(get_at(state, p[:-1]), dict)]


@pytest.fixture
def edit_base(make_world, api):
    """A state with recognisable values: balance 123457 (cy), payment 7777, a paid request,
    a partially captured open authorisation of 2000 (700 captured)."""
    w = make_world(fixture2(operators=["u_ada"], users=[
        user("ada", 100000), user("bob", 5000), user("cy", 123457)]))
    w.pay = ok(w.ada.pay("bob", 7777, note="seven"), 201)
    w.rid = ok(w.bob.ask("ada", 4321), 201)["request_id"]
    w.rpay = ok(w.ada.pay_request(w.rid), 201)
    w.auth = ok(authorize(w.ada, "bob", 2000), 201)
    w.cap = ok(capture(w.bob, w.auth["authorization_id"], {"amount": 700, "final": False}), 201)
    w.snap = ok(api().get("/_test/export"), 200)
    return w


def import_edited(w, api, edit, expect=422):
    doc = copy.deepcopy(w.snap)
    if edit(doc["state"]) is False:
        pytest.skip("the export's state does not show this value")
    before = view(w)
    r = api().post("/_test/import", doc)
    if expect == 422:
        err(r, 422, "validation_failed")
        assert view(w) == before, "a refused import changes nothing"
    else:
        ok(r, expect)


def replace_value(old, new, all_places=True):
    def edit(state):
        ps = paths_of(state, lambda v: v == old and not isinstance(v, bool))
        if not ps:
            return False
        for p in (ps if all_places else ps[:1]):
            set_at(state, p, new)
    return edit


@pytest.mark.req("S2-158", "S1-158", "S1-027")
def test_edited_id_too_long(edit_base, api):
    """S1-158 "an invalid state give[s] 422" — the authorisation id made 65 characters
    everywhere it appears."""
    import_edited(edit_base, api, replace_value(edit_base.auth["authorization_id"], "a" * 65))


@pytest.mark.req("S2-158", "S1-158", "S1-051")
@pytest.mark.parametrize("bad", [-1, 1.5, TWO53 + 1, "123457", None])
def test_edited_balance(edit_base, api, bad):
    """S1-158 a balance that breaks §4 (negative, non-integer, above 2^53, wrong type)."""
    import_edited(edit_base, api, replace_value(123457, bad))


@pytest.mark.req("S2-158", "S1-158", "S1-099")
@pytest.mark.parametrize("bad", [10 ** 9 + 1, 1.5, -7777])
def test_edited_payment_amount(edit_base, api, bad):
    """S1-158 a payment amount outside 1..1000000000 or not an integer."""
    import_edited(edit_base, api, replace_value(7777, bad))


@pytest.mark.req("S2-158", "S1-158", "S1-024")
@pytest.mark.parametrize("bad", ["huge", "year10000", "garbage"])
def test_edited_timestamps(edit_base, api, bad):
    """S1-158 / S1-024 every timestamp in the state set beyond RFC 3339's range (or garbage)."""
    now_ms = time.time() * 1000

    def edit(state):
        ms = paths_of(state, lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
                      and abs(v - now_ms) < 86400000 * 400)
        iso = paths_of(state, lambda v: isinstance(v, str) and len(v) >= 20 and v[4:5] == "-"
                       and v[10:11] == "T")
        if not ms and not iso:
            return False
        for p in ms:
            set_at(state, p, {"huge": 10 ** 20, "year10000": 253402300800000,
                              "garbage": "x"}[bad])
        for p in iso:
            set_at(state, p, {"huge": "+275760-09-13T00:00:00.000Z",
                              "year10000": "10000-01-01T00:00:00+00:00", "garbage": "x"}[bad])
    import_edited(edit_base, api, edit)


@pytest.mark.req("S2-158", "S1-158", "S1-114")
def test_edited_paid_request_back_to_pending(edit_base, api):
    """S1-158 a paid request set back to `pending` (its payment still exists): refused, so it
    can never be paid twice."""
    def edit(state):
        recs = [r for r in record_holding(state, edit_base.rid) if "paid" in r.values()]
        if not recs:
            return False
        for r in recs:
            for k, v in list(r.items()):
                if v == "paid":
                    r[k] = "pending"
                if v == edit_base.rpay["payment_id"]:
                    r[k] = None
    import_edited(edit_base, api, edit)


@pytest.mark.req("S2-158", "S2-083", "S2-120")
def test_edited_authorization_amount_below_captured(edit_base, api):
    """S2-158 / S2-083 "Cumulative captures must not exceed the authorized amount" — the
    authorisation's amount edited to 500 while 700 was captured."""
    def edit(state):
        recs = [r for r in record_holding(state, edit_base.auth["authorization_id"])
                if 2000 in r.values()]
        if not recs:
            return False
        for r in recs:
            for k, v in list(r.items()):
                if v == 2000:
                    r[k] = 500
    import_edited(edit_base, api, edit)


@pytest.mark.req("S2-158", "S2-081", "S2-094")
def test_edited_hold_above_balance(edit_base, api):
    """S2-158 / S2-081 an open hold edited above its payer's total (available would be
    negative) is an invalid state."""
    def edit(state):
        recs = [r for r in record_holding(state, edit_base.auth["authorization_id"])
                if 2000 in r.values()]
        if not recs:
            return False
        for r in recs:
            for k, v in list(r.items()):
                if v == 2000:
                    r[k] = 10 ** 9
    import_edited(edit_base, api, edit)


@pytest.mark.req("S2-158", "S2-112")
def test_edited_capture_link_to_missing_authorization(edit_base, api):
    """S2-158 a capture payment whose `authorization_id` names no authorisation."""
    def edit(state):
        recs = [r for r in record_holding(state, edit_base.cap["payment_id"])
                if edit_base.auth["authorization_id"] in r.values()]
        if not recs:
            return False
        for r in recs:
            for k, v in list(r.items()):
                if v == edit_base.auth["authorization_id"]:
                    r[k] = "a_ghost"
    import_edited(edit_base, api, edit)


@pytest.mark.req("S2-158", "S2-095")
def test_edited_authorization_status(edit_base, api):
    """S2-158 an authorisation status outside the four."""
    def edit(state):
        recs = [r for r in record_holding(state, edit_base.auth["authorization_id"])
                if "open" in r.values()]
        if not recs:
            return False
        for r in recs:
            for k, v in list(r.items()):
                if v == "open":
                    r[k] = "frozen"
    import_edited(edit_base, api, edit)


@pytest.mark.req("S2-158", "S1-154")
def test_unedited_base_imports(edit_base, api):
    """Control for the edited-export tests: the same export unedited imports with 204."""
    import_edited(edit_base, api, lambda s: None, expect=204)


# ---- large resets (standing; S1-013 with holds) ---------------------------------------------

@pytest.mark.req("S1-013", "S2-093", "S2-094")
def test_large_reset_with_holds_within_10_seconds(api, control):
    """S1-013 "10 s for `POST /_test/reset`" with 1000 users (distinct passwords) and 2000 seeded
    authorisations; a login during it answers within 5 s."""
    import threading
    users = [user(f"h{i}", 5000, password=f"pw-{i}-{new_key()[:5]}") for i in range(1000)]
    auths = [auth(f"a_{i}", f"h{i % 1000}", f"h{(i + 1) % 1000}", 1000,
                  status=["open", "captured", "voided", "expired"][i % 4],
                  expires_at=hours(2 if i % 4 != 3 else -2)) for i in range(2000)]
    fx = fixture2(users=users, authorizations=auths)
    ok(control.post("/_test/reset", fixture()), 204)
    side = {}

    def during():
        time.sleep(1)
        t = time.time()
        r = Api().login("ada@example.com")
        side["s"] = (r.status_code, time.time() - t)
    th = threading.Thread(target=during)
    th.start()
    t0 = time.time()
    ok(control.post("/_test/reset", fx), 204)
    dt = time.time() - t0
    th.join()
    assert dt < 10.0, f"reset took {dt:.2f}s"
    assert side["s"][1] < 5.0, side
    c = api(ok(api().login("h0@example.com", users[0]["password"]), 200)["token"])
    m = me(c)
    # a_0 and a_1000 are both open holds of 1000 from h0
    assert m["held"] == 2000 and m["available"] == 3000


# ---- concurrency -------------------------------------------------------------------------------

@pytest.mark.req("S2-157", "S2-083", "S2-080", "S2-081")
def test_concurrent_partial_captures_never_exceed(make_world):
    """S2-157 serialisable: 50 concurrent non-final captures of 100 against 2000 — exactly 20
    succeed, the rest are refused; totals hold at every step."""
    w = make_world(fixture())
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    cs = [Api(w.bob.base_url, w.bob.token) for _ in range(50)]
    try:
        out = burst(lambda i: capture(cs[i], aid, {"amount": 100, "final": False}), 50)
    finally:
        for c in cs:
            c.close()
    n = sum(r.status_code == 201 for r in out)
    assert n == 20, [r.status_code for r in out]
    for r in out:
        if r.status_code != 201:
            err_any(r, {(409, "authorization_not_open"), (422, "capture_exceeds_authorization")})
    x = auths_list(w.ada)[0]
    assert (x["status"], x["captured_amount"], x["remaining_amount"]) == ("captured", 2000, 0)
    assert len(x["payment_ids"]) == 20
    assert me(w.ada)["total"] == 8000 and me(w.bob)["total"] == 4500


@pytest.mark.req("S2-157", "S2-081")
def test_concurrent_authorize_and_pay_never_overdraw(make_world):
    """S2-157 / S2-081: authorisations and payments race for one wallet's available funds; the
    sum of successes never exceeds it and available never goes negative."""
    w = make_world(fixture(users=[user("ada", 1000), user("bob", 0)]))
    cs = [Api(w.ada.base_url, w.ada.token) for _ in range(50)]
    try:
        out = burst(lambda i: (authorize(cs[i], "bob", 60) if i % 2 else cs[i].pay("bob", 60)),
                    50)
    finally:
        for c in cs:
            c.close()
    n = sum(r.status_code == 201 for r in out)
    assert n == 16, n
    m = me(w.ada)
    assert m["available"] == 1000 - 60 * n and m["available"] >= 0
    assert m["total"] + me(w.bob)["total"] == 1000


@pytest.mark.req("S2-157", "S2-083")
def test_capture_and_void_race(make_world):
    """S2-157: capture and void of one authorisation at once — exactly one wins, and money moves
    only if the capture won."""
    w = make_world(fixture())
    for _ in range(5):
        aid = ok(authorize(w.ada, "bob", 500), 201)["authorization_id"]
        a = [Api(w.ada.base_url, w.ada.token) for _ in range(5)]
        b = [Api(w.bob.base_url, w.bob.token) for _ in range(5)]
        before = me(w.bob)["total"]
        try:
            out = burst(lambda i: capture(b[i // 2], aid) if i % 2 else void(a[i // 2], aid), 10)
        finally:
            for c in a + b:
                c.close()
        x = next(y for y in auths_list(w.ada) if y["authorization_id"] == aid)
        caps = [r for r in out if r.status_code == 201]
        assert x["status"] in ("captured", "voided")
        assert (x["status"] == "captured") == (len(caps) == 1)
        assert me(w.bob)["total"] == before + (500 if caps else 0)
        assert me(w.ada)["held"] == 0
