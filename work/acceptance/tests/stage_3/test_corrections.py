"""Stage 3: corrections, revisions, known_at, historical overdraft, linked payments."""
from datetime import timedelta

import pytest

from conftest import (Api, assert_timestamp, burst, err, err_any, fixture, new_key, ok,
                      seeded_total, ts, user)
from s3 import (ago, at, before, correct, full_statement, later, me_at, pay_rec, revisions,
                statement)

REV_FIELDS = {"payment_id", "revision", "amount", "effective_at", "recorded_at", "reason"}


@pytest.fixture
def w(make_world):
    return make_world(fixture(operators=["u_ada"]))


def total_now(w):
    return sum(c.balance() for c in w.clients.values())


# ---- the correction itself ---------------------------------------------------------------------

@pytest.mark.req("S3-029", "S3-033", "S3-039", "S3-022")
def test_decrease(w):
    """S3-029 "returning 201 with `payment_id`, `revision`, `amount`, `effective_at`,
    server-assigned `recorded_at`, and `reason`"; S3-033 "decreasing it debits the original
    receiver"; S3-039 the revisions list."""
    p = ok(w.ada.pay("bob", 1000, note="dinner"), 201)
    c = ok(correct(w.ada, p["payment_id"], 1, 400, p["created_at"], reason="corrected amount"), 201)
    assert REV_FIELDS <= set(c)
    assert (c["payment_id"], c["revision"], c["amount"], c["reason"]) == \
        (p["payment_id"], 2, 400, "corrected amount")
    assert ts(c["effective_at"]) == ts(p["created_at"])
    assert_timestamp(c["recorded_at"])
    assert ts(c["recorded_at"]) > ts(p["created_at"])
    assert w.ada.balance() == 9600 and w.bob.balance() == 2900
    revs = revisions(w.ada, p["payment_id"])
    assert [r["revision"] for r in revs] == [1, 2]
    r1 = revs[0]
    assert r1["amount"] == 1000 and r1["reason"] == ""
    assert ts(r1["effective_at"]) == ts(r1["recorded_at"]) == ts(p["created_at"])
    assert {k: revs[1][k] for k in REV_FIELDS} == {k: c[k] for k in REV_FIELDS}
    assert revisions(w.bob, p["payment_id"]) == revs


@pytest.mark.req("S3-033", "S3-034")
def test_increase_debits_the_sender(w):
    """S3-033 "Increasing the amount debits the original sender" """
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(correct(w.ada, p["payment_id"], 1, 1500, p["created_at"]), 201)
    assert w.ada.balance() == 8500 and w.bob.balance() == 3500


@pytest.mark.req("S3-027", "S3-044")
def test_zero_reverses(w):
    """S3-027 "zero reverses the entire payment"; S3-044 "Zero-amount revisions still appear as
    entries with zero delta." """
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(correct(w.ada, p["payment_id"], 1, 0, p["created_at"]), 201)
    assert w.ada.balance() == 10000 and w.bob.balance() == 2500
    s = statement(w.ada)
    e = [x for x in s["entries"] if x["payment"]["payment_id"] == p["payment_id"]]
    assert len(e) == 1 and e[0]["delta"] == 0 and e[0]["payment"]["amount"] == 0
    assert e[0]["revision"] == 2


@pytest.mark.req("S3-030", "S3-031", "S3-039")
def test_chain_of_corrections(w):
    """S3-030 "Recorded times for one payment strictly increase."; S3-031 stale revision."""
    p = ok(w.ada.pay("bob", 100), 201)
    for rev, amount in ((1, 90), (2, 80), (3, 70), (4, 71)):
        ok(correct(w.ada, p["payment_id"], rev, amount, p["created_at"]), 201)
    revs = revisions(w.ada, p["payment_id"])
    assert [r["amount"] for r in revs] == [100, 90, 80, 70, 71]
    rec = [ts(r["recorded_at"]) for r in revs]
    assert all(a < b for a, b in zip(rec, rec[1:])), rec
    err(correct(w.ada, p["payment_id"], 4, 5, p["created_at"]), 409, "stale_revision")
    err(correct(w.ada, p["payment_id"], 1, 5, p["created_at"]), 409, "stale_revision")
    err(correct(w.ada, p["payment_id"], 9, 5, p["created_at"]), 409, "stale_revision")
    assert w.ada.balance() == 10000 - 71


@pytest.mark.req("S3-028", "S3-038")
def test_parties_visibility_and_feed_unchanged(w):
    """S3-028 "Correction changes neither parties nor visibility."; S3-038 "`GET /activity`
    continues to display the original payment; correction records are not new feed payments." """
    k = new_key()
    p = ok(w.ada.pay("bob", 1000, visibility="private", note="orig", key=k), 201)
    ok(correct(w.ada, p["payment_id"], 1, 600, p["created_at"], to_handle="cy",
               visibility="public", from_handle="cy"), 201)
    feed = w.ada.feed()
    assert len(feed) == 1 and feed[0] == p
    assert w.cy.feed() == []
    assert ok(w.ada.pay("bob", 1000, visibility="private", note="orig", key=k), 200) == p
    assert w.cy.balance() == 500
    e = statement(w.bob)["entries"][0]
    assert (e["payment"]["from_handle"], e["payment"]["to_handle"], e["payment"]["visibility"]) == \
        ("ada", "bob", "private")


@pytest.mark.req("S3-025")
def test_only_the_sender_corrects(w):
    """S3-025 "An authenticated non-sender gets 403 `forbidden`; unknown payment gets 404." """
    p = ok(w.ada.pay("bob", 100), 201)
    err(correct(w.bob, p["payment_id"], 1, 50, p["created_at"]), 403, "forbidden")
    err(correct(w.cy, p["payment_id"], 1, 50, p["created_at"]), 403, "forbidden")
    err(correct(w.ada, "p_nope", 1, 50, p["created_at"]), 404, "not_found")
    err(w.ada.post(f"/payments/{p['payment_id']}/corrections",
                   {"expected_revision": 1, "amount": 5, "effective_at": p["created_at"],
                    "reason": "x"}, key=new_key(), token=None), 401, "unauthenticated")
    assert len(revisions(w.ada, p["payment_id"])) == 1


@pytest.mark.req("S3-025", "S3-069")
def test_correction_needs_a_key(w):
    """S3-025 "requires an idempotency key" """
    p = ok(w.ada.pay("bob", 100), 201)
    err(w.ada.post(f"/payments/{p['payment_id']}/corrections",
                   {"expected_revision": 1, "amount": 5, "effective_at": p["created_at"],
                    "reason": "x"}), 400, "missing_idempotency_key")


@pytest.mark.req("S3-026")
@pytest.mark.parametrize("missing", ["expected_revision", "amount", "effective_at", "reason"])
def test_all_fields_required(w, missing):
    """S3-026 "All fields are required." """
    p = ok(w.ada.pay("bob", 100), 201)
    body = {"expected_revision": 1, "amount": 50, "effective_at": p["created_at"], "reason": "x"}
    del body[missing]
    err(w.ada.post(f"/payments/{p['payment_id']}/corrections", body, key=new_key()), 422,
        "validation_failed")


@pytest.mark.req("S3-027")
@pytest.mark.parametrize("field,value", [
    ("expected_revision", 0), ("expected_revision", -1), ("expected_revision", 1.5),
    ("expected_revision", "1"), ("expected_revision", True),
    ("amount", -1), ("amount", 10 ** 9 + 1), ("amount", 1.5), ("amount", "5"), ("amount", None),
    ("reason", ""), ("reason", "x" * 201), ("reason", "😀" * 201), ("reason", None), ("reason", 5),
    ("effective_at", "2026-09-24T10:00:00"), ("effective_at", "2026-09-24"), ("effective_at", ""),
    ("effective_at", "garbage"), ("effective_at", "FUTURE"), ("effective_at", "2026-02-30T10:00:00Z")])
def test_invalid_correction_input(w, field, value):
    """S3-027 "Revision is a positive integer; amount is an integer 0..1000000000 ...; reason is
    a string of 1..200 characters; effective time is an RFC 3339 instant not later than now.
    Invalid input is 422" (D3-2: FUTURE is an hour ahead)."""
    p = ok(w.ada.pay("bob", 100), 201)
    if value == "FUTURE":
        value = later(p["created_at"], hours=1)
    body = {"expected_revision": 1, "amount": 50, "effective_at": p["created_at"], "reason": "x"}
    body[field] = value
    r = w.ada.post(f"/payments/{p['payment_id']}/corrections", body, key=new_key())
    wrong_type = (field == "expected_revision" and not isinstance(value, (int, float))) or \
        (field == "expected_revision" and isinstance(value, bool)) or \
        (field in ("reason", "effective_at") and not isinstance(value, str))
    if wrong_type:
        # §5 sends a wrong JSON type to 400; the stage-3 sentence says 422 — either is accepted
        err_any(r, {(400, "malformed_request"), (422, "validation_failed")})
    else:
        err(r, 422, "validation_failed")
    assert len(revisions(w.ada, p["payment_id"])) == 1 and w.ada.balance() == 9900


@pytest.mark.req("S3-027")
def test_correction_bounds_valid(make_world):
    """S3-027 the boundary values are valid: amount 1000000000, a 200-character reason, an
    effective time long before the payment."""
    w = make_world(fixture(users=[user("ada", 2 * 10 ** 9), user("bob", 0)]))
    p = ok(w.ada.pay("bob", 5), 201)
    ok(correct(w.ada, p["payment_id"], 1, 10 ** 9, p["created_at"], reason="😀" * 200), 201)
    ok(correct(w.ada, p["payment_id"], 2, 7, "2001-01-01T00:00:00+00:00", reason="r"), 201)
    assert w.bob.balance() == 7


@pytest.mark.req("S3-032", "S3-069")
def test_correction_replay(w):
    """S3-032 "Successful replay returns that original revision with 200 even after newer
    revisions. Different body with the same key is 409" """
    p = ok(w.ada.pay("bob", 100), 201)
    k = new_key()
    first = ok(correct(w.ada, p["payment_id"], 1, 80, p["created_at"], reason="a", key=k), 201)
    ok(correct(w.ada, p["payment_id"], 2, 60, p["created_at"]), 201)
    assert ok(correct(w.ada, p["payment_id"], 1, 80, p["created_at"], reason="a", key=k), 200) == first
    err(correct(w.ada, p["payment_id"], 1, 81, p["created_at"], reason="a", key=k), 409,
        "idempotency_key_reuse")
    err(correct(w.ada, p["payment_id"], 1, -5, p["created_at"], reason="a", key=k), 409,
        "idempotency_key_reuse")
    assert w.ada.balance() == 9940


@pytest.mark.req("S3-036", "S3-069")
def test_failed_correction_claims_no_key(w):
    """S3-036 "Either failure preserves ... idempotency state." — the key is reusable."""
    p = ok(w.ada.pay("bob", 100), 201)
    k = new_key()
    err(correct(w.ada, p["payment_id"], 2, 80, p["created_at"], key=k), 409, "stale_revision")
    err(correct(w.ada, p["payment_id"], 1, 20000, p["created_at"], key=k), 409,
        "insufficient_funds")
    ok(correct(w.ada, p["payment_id"], 1, 80, p["created_at"], key=k), 201)


# ---- money checks -------------------------------------------------------------------------------

@pytest.mark.req("S3-034", "S3-036")
def test_unaffordable_now(w):
    """S3-034 "A currently unaffordable debit gives 409 `insufficient_funds`." — both
    directions, with nothing changed."""
    p = ok(w.cy.pay("bob", 400), 201)                 # cy 100 left
    err(correct(w.cy, p["payment_id"], 1, 501, p["created_at"]), 409, "insufficient_funds")
    q = ok(w.ada.pay("dan", 300), 201)
    ok(w.dan.pay("ada", 250), 201)                    # dan holds 50
    err(correct(w.ada, q["payment_id"], 1, 200, q["created_at"]), 409, "insufficient_funds")
    assert (w.cy.balance(), w.dan.balance()) == (100, 50)
    assert len(revisions(w.cy, p["payment_id"])) == 1 and len(revisions(w.ada, q["payment_id"])) == 1
    s = statement(w.dan)
    assert [e["delta"] for e in s["entries"]] == [300, -250]


@pytest.mark.req("S3-035", "S3-036")
def test_historical_overdraft(make_world):
    """S3-035 "if any user's corrected balance is negative at any effective-time boundary, return
    409 `historical_overdraft`" — bob can pay the 500 now, but had spent it in between."""
    w = make_world(fixture(users=[user("ada", 10000), user("bob", 0), user("cy", 0),
                                  user("dan", 600)]))
    p1 = ok(w.ada.pay("bob", 1000), 201)
    ok(w.bob.pay("cy", 1000), 201)
    ok(w.dan.pay("bob", 600), 201)
    before_state = (statement(w.bob), [c.balance() for c in w.clients.values()])
    err(correct(w.ada, p1["payment_id"], 1, 500, p1["created_at"]), 409, "historical_overdraft")
    assert (statement(w.bob), [c.balance() for c in w.clients.values()]) == before_state
    assert len(revisions(w.ada, p1["payment_id"])) == 1
    assert w.bob.balance() == 600
    # a smaller reduction that keeps bob at zero at the spend is fine
    ok(correct(w.ada, p1["payment_id"], 1, 1000, p1["created_at"]), 201)


@pytest.mark.req("S3-035")
def test_boundary_combines_movements_at_one_instant(make_world):
    """S3-035 "Balances at a boundary include the combined effect of all movements at that
    instant." — bob receives 1000 and sends 1000 at the same T; ids put his outgoing first."""
    T = ago(hours=2)
    fx = fixture(users=[user("ada", 9000), user("bob", 5), user("cy", 1000), user("dan", 0)],
                 payments=[pay_rec("p_a", "bob", "cy", 1000, T), pay_rec("p_b", "ada", "bob", 1000, T),
                           pay_rec("p_c", "ada", "bob", 5, ago(hours=1))])
    w = make_world(fx)
    assert me_at(w.bob, at(T - timedelta(seconds=1)))["balance"] == 0
    ok(correct(w.ada, "p_b", 1, 1001, at(T)), 201)                 # bob +1 at T: fine
    ok(correct(w.bob, "p_a", 1, 1001, at(T)), 201)                 # combined 0 at T: fine
    err(correct(w.bob, "p_a", 2, 1002, at(T)), 409, "historical_overdraft")   # -1 at T
    assert w.bob.balance() == 5


@pytest.mark.req("S3-037", "S3-023")
def test_corrections_keep_totals_and_openings(make_world):
    """S3-037 sums hold in every historical view after corrections; S3-023 "Corrections must not
    change those opening balances." """
    T1, T2 = ago(hours=3), ago(hours=1)
    fx = fixture(payments=[pay_rec("p_1", "ada", "bob", 500, T1), pay_rec("p_2", "bob", "cy", 100, T2)])
    w = make_world(fx)
    opening = {h: me_at(c, at(T1 - timedelta(hours=1)))["balance"] for h, c in w.clients.items()}
    ok(correct(w.ada, "p_1", 1, 300, at(T1 - timedelta(minutes=30))), 201)
    ok(correct(w.bob, "p_2", 1, 0, at(T2)), 201)
    p = ok(w.cy.pay("dan", 50), 201)
    ok(correct(w.cy, p["payment_id"], 1, 20, p["created_at"]), 201)
    total = seeded_total(fx)
    for t in (T1 - timedelta(hours=1), T1 - timedelta(minutes=30), T1, T2, ago(seconds=0)):
        assert sum(me_at(c, at(t))["balance"] for c in w.clients.values()) == total
    assert {h: me_at(c, at(T1 - timedelta(hours=1)))["balance"] for h, c in w.clients.items()} == opening
    assert total_now(w) == total


@pytest.mark.req("S3-051", "S3-044", "S3-043")
def test_correction_moves_payment_across_window(make_world):
    """S3-051 "A correction may move a payment into or out of a statement window."; S3-044
    ordering by selected `effective_at`."""
    T1, T2 = ago(hours=3), ago(hours=1)
    w = make_world(fixture(payments=[pay_rec("p_1", "ada", "bob", 500, T1),
                                     pay_rec("p_2", "ada", "bob", 200, T2)]))
    win = {"from": at(T1 - timedelta(minutes=1)), "to": at(T1 + timedelta(minutes=1))}
    assert [e["payment"]["payment_id"] for e in statement(w.ada, **win)["entries"]] == ["p_1"]
    ok(correct(w.ada, "p_1", 1, 500, at(T2 + timedelta(minutes=10))), 201)
    assert statement(w.ada, **win)["entries"] == []
    s = statement(w.ada)
    assert [e["payment"]["payment_id"] for e in s["entries"]] == ["p_2", "p_1"]
    e1 = s["entries"][1]
    assert e1["revision"] == 2 and ts(e1["effective_at"]) == ts(at(T2 + timedelta(minutes=10)))
    assert ts(e1["recorded_at"]) > ts(at(T2))
    assert me_at(w.ada, at(T1 + timedelta(minutes=1)))["balance"] == 10700
    ok(correct(w.ada, "p_2", 1, 200, at(T1)), 201)
    assert [e["payment"]["payment_id"] for e in statement(w.ada, **win)["entries"]] == ["p_2"]


# ---- known_at --------------------------------------------------------------------------------

@pytest.mark.req("S3-041", "S3-042", "S3-043", "S3-044")
def test_known_at_selects_revisions(w):
    """S3-042 "select its latest revision recorded **at or before** `known_at`; if none was yet
    recorded, that payment contributes nothing." S3-041 echo."""
    p = ok(w.ada.pay("bob", 1000), 201)
    c2 = ok(correct(w.ada, p["payment_id"], 1, 400, p["created_at"]), 201)
    c3 = ok(correct(w.ada, p["payment_id"], 2, 700, p["created_at"]), 201)
    created, r2, r3 = p["created_at"], c2["recorded_at"], c3["recorded_at"]
    future = later(created, days=1)
    assert me_at(w.ada, known_at=before(created, seconds=1))["balance"] == 10000
    assert me_at(w.ada, known_at=created)["balance"] == 9000
    assert me_at(w.ada, known_at=before(r2, milliseconds=1))["balance"] == 9000
    assert me_at(w.ada, known_at=r2)["balance"] == 9600
    assert me_at(w.ada, known_at=r3)["balance"] == 9300
    m = me_at(w.ada, as_of=future, known_at=future)
    assert m["balance"] == 9300 and m["known_at"] == future and m["as_of"] == future
    s = statement(w.ada, known_at=r2)
    e = s["entries"][0]
    assert (e["revision"], e["payment"]["amount"], e["delta"]) == (2, 400, -400)
    assert ts(e["recorded_at"]) == ts(r2) and s["known_at"] == r2
    assert len(s["entries"]) == 1
    s = statement(w.ada, known_at=before(created, seconds=1))
    assert s["entries"] == [] and s["closing_balance"] == 10000
    assert [e["revision"] for e in statement(w.ada)["entries"]] == [3]


@pytest.mark.req("S3-041")
@pytest.mark.parametrize("bad", ["2026-09-24T13:20:00", "2026-09-24", "", "x"])
def test_known_at_must_be_an_instant(w, bad):
    """S3-041 "Invalid/empty instants are 422." """
    err(w.ada.get("/me", params={"known_at": bad}), 422, "validation_failed")
    err(w.ada.get("/statement", params={"known_at": bad}), 422, "validation_failed")


@pytest.mark.req("S3-044", "S3-008")
def test_no_corrections_no_known_at_unchanged(w):
    """S3-044 "With no corrections and no `known_at`, previous behavior is unchanged." — entries
    carry revision 1 with effective = recorded = created."""
    p = ok(w.ada.pay("bob", 5), 201)
    e = statement(w.ada)["entries"][0]
    assert e["revision"] == 1 and e["payment"]["payment_id"] == p["payment_id"]
    assert ts(e["effective_at"]) == ts(e["recorded_at"]) == ts(p["created_at"])
    assert e["payment"]["amount"] == 5


# ---- revisions endpoint ------------------------------------------------------------------------

@pytest.mark.req("S3-040")
def test_revisions_only_for_parties(w):
    """S3-040 "Only the two parties can read it; a third party gets 404 even for a public
    payment. No token is 401." """
    p = ok(w.ada.pay("bob", 5, visibility="public"), 201)
    assert len(revisions(w.bob, p["payment_id"])) == 1
    err(w.cy.get(f"/payments/{p['payment_id']}/revisions"), 404, "not_found")
    err(w.ada.get(f"/payments/{p['payment_id']}/revisions", token=None), 401, "unauthenticated")
    err(w.ada.get("/payments/p_nope/revisions"), 404, "not_found")


# ---- linked payments ------------------------------------------------------------------------------

@pytest.mark.req("S3-053", "S3-054")
def test_settlement_members(w):
    """S3-053 "Each member's original revision uses its shared committed_at as both effective_at
    and recorded_at." S3-054 "422 `linked_payment_immutable`" """
    s = ok(w.ada.settle([{"from_handle": "ada", "to_handle": "bob", "amount": 10},
                         {"from_handle": "bob", "to_handle": "cy", "amount": 5}]), 201)
    for m in s["payments"]:
        payer = w.ada if m["from_handle"] == "ada" else w.bob
        r = revisions(payer, m["payment_id"])
        assert len(r) == 1
        assert ts(r[0]["effective_at"]) == ts(r[0]["recorded_at"]) == ts(s["committed_at"])
        err(correct(payer, m["payment_id"], 1, 1, s["committed_at"]), 422,
            "linked_payment_immutable")
    assert w.cy.balance() == 505


@pytest.mark.req("S3-055", "S3-066")
def test_capture_is_immutable(w):
    """S3-055 "a correction of a capture gives 422 `linked_payment_immutable`"; S3-066 "Captures
    appear exactly once with their links." """
    from s2 import authorize, capture
    a = ok(authorize(w.ada, "bob", 300), 201)
    p = ok(capture(w.bob, a["authorization_id"], {"amount": 120, "final": False}), 201)
    err(correct(w.ada, p["payment_id"], 1, 1, p["created_at"]), 422, "linked_payment_immutable")
    s = statement(w.ada)
    caps = [e for e in s["entries"] if e["payment"]["payment_id"] == p["payment_id"]]
    assert len(caps) == 1 and caps[0]["payment"]["authorization_id"] == a["authorization_id"]
    assert caps[0]["delta"] == -120
    assert len(s["entries"]) == 1, "authorisation and release are not entries"


@pytest.mark.req("S3-025", "S3-033")
def test_request_payment_can_be_corrected(w):
    """D3-6: a payment made by paying a request is ordinary; its sender may correct it."""
    rid = ok(w.bob.ask("ada", 300), 201)["request_id"]
    p = ok(w.ada.pay_request(rid), 201)
    ok(correct(w.ada, p["payment_id"], 1, 250, p["created_at"]), 201)
    assert w.ada.balance() == 9750


# ---- concurrency ---------------------------------------------------------------------------------

@pytest.mark.req("S3-052")
def test_concurrent_corrections_same_revision(w):
    """S3-052 "Concurrent corrections using the same expected revision cannot both succeed." """
    p = ok(w.ada.pay("bob", 1000), 201)
    cs = [Api(w.ada.base_url, w.ada.token) for _ in range(20)]
    try:
        out = burst(lambda i: correct(cs[i], p["payment_id"], 1, 900 - i, p["created_at"]), 20)
    finally:
        for c in cs:
            c.close()
    codes = [r.status_code for r in out]
    assert codes.count(201) == 1, codes
    for r in out:
        if r.status_code != 201:
            err(r, 409, "stale_revision")
    win = next(r.json() for r in out if r.status_code == 201)
    assert w.ada.balance() == 10000 - win["amount"]
    assert len(revisions(w.ada, p["payment_id"])) == 2
