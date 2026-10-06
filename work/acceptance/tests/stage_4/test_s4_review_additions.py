"""Stage 4 rows added after the coordinator's review: S4-038..S4-041."""
import pytest

from conftest import Api, burst, err, err_any, fixture, new_key, ok, ts, user
from s2 import fixture2, me
from s3 import before, correct, later, me_at, revisions, statement
from s4 import batch, item, refund


@pytest.fixture
def w(make_world):
    return make_world(fixture2(operators=["u_ada"]))


# ---- S4-038 -------------------------------------------------------------------------------

@pytest.mark.req("S4-038", "S4-007")
def test_parallel_refunds_never_exceed(make_world):
    """S4-038 30 refunds of 70 against 1000, all at once: 14 succeed (980), the rest are 422
    `refund_exceeds_payment`."""
    w = make_world(fixture2(users=[user("ada", 10000), user("bob", 0)]))
    p = ok(w.ada.pay("bob", 1000), 201)
    cs = [Api(w.bob.base_url, w.bob.token) for _ in range(30)]
    try:
        out = burst(lambda i: refund(cs[i], p["payment_id"], 70), 30)
    finally:
        for c in cs:
            c.close()
    assert sum(r.status_code == 201 for r in out) == 14, [r.status_code for r in out]
    for r in out:
        if r.status_code != 201:
            err(r, 422, "refund_exceeds_payment")
    assert w.bob.balance() == 20 and w.ada.balance() == 9980


@pytest.mark.req("S4-038", "S4-014")
@pytest.mark.parametrize("loop", range(5))
def test_refund_races_a_lowering_correction(w, loop):
    """S4-038 a refund of 800 racing a correction to 300: exactly one succeeds; whichever loses
    gets 422 `refund_exceeds_payment`."""
    p = ok(w.ada.pay("bob", 1000), 201)
    a, b = Api(w.ada.base_url, w.ada.token), Api(w.bob.base_url, w.bob.token)
    try:
        out = burst(lambda i: correct(a, p["payment_id"], 1, 300, p["created_at"]) if i == 0
                    else refund(b, p["payment_id"], 800), 2)
    finally:
        a.close()
        b.close()
    codes = sorted(r.status_code for r in out)
    assert codes == [201, 422], codes
    loser = next(r for r in out if r.status_code == 422)
    err(loser, 422, "refund_exceeds_payment")
    revs = revisions(w.ada, p["payment_id"])
    if len(revs) == 2:
        assert w.bob.balance() == 2500 + 300
    else:
        assert w.bob.balance() == 2500 + 200


# ---- S4-039 -------------------------------------------------------------------------------

@pytest.mark.req("S4-039", "S4-029")
def test_correction_batch_id_on_revisions(w, api, reset):
    """S4-039 set on batch revisions, null on revision 1 and on single corrections; survives
    export and import."""
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(correct(w.ada, p["payment_id"], 1, 900, p["created_at"]), 201)
    b = ok(batch(w.ada, [item(p, 2, 800)]), 201)
    revs = revisions(w.ada, p["payment_id"])
    assert [r["correction_batch_id"] for r in revs] == [None, None, b["correction_batch_id"]]
    snap = ok(api().get("/_test/export"), 200)
    reset(fixture())
    ok(api().post("/_test/import", snap), 204)
    assert revisions(w.ada, p["payment_id"]) == revs


# ---- S4-040 -------------------------------------------------------------------------------

@pytest.mark.req("S4-040", "S4-014")
def test_batch_item_below_refunded(w):
    """S4-040 an item below the refunded amount is 422 `refund_exceeds_payment`."""
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(refund(w.bob, p["payment_id"], 400), 201)
    err(batch(w.ada, [item(p, 1, 399)]), 422, "refund_exceeds_payment")
    ok(batch(w.ada, [item(p, 1, 400)]), 201)


@pytest.mark.req("S4-040", "S4-026")
def test_refund_limit_is_an_item_error(w):
    """S4-040 ranked as an item error in input order, before completeness and funds."""
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(refund(w.bob, p["payment_id"], 400), 201)
    below = item(p, 1, 100)
    unknown = item("p_nope", 1, 0, p["created_at"])
    err(batch(w.ada, [below, unknown]), 422, "refund_exceeds_payment")
    err(batch(w.ada, [unknown, below]), 404, "not_found")
    s = ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 300},
                         {"from_handle": "cy", "to_handle": "dan", "amount": 100}]), 201)
    m1 = s["payments"][0]
    ok(refund(w.cy, m1["payment_id"], 200), 201)
    err(batch(w.ada, [item(m1, 1, 100, s["committed_at"])]), 422, "refund_exceeds_payment")
    q = ok(w.cy.pay("dan", 50), 201)
    ok(w.dan.pay("ada", 150), 201)                     # dan holds 0: q -> 0 is unaffordable
    err(batch(w.ada, [item(q, 1, 0), below]), 422, "refund_exceeds_payment")


# ---- S4-041 -------------------------------------------------------------------------------

@pytest.mark.req("S4-041", "S4-008")
def test_refund_in_history(w):
    """S4-041 the refund's own revision 1, `as_of` for both parties, statements, and a later
    correction of the target leaves the refund unchanged."""
    p = ok(w.ada.pay("bob", 1000), 201)
    import time
    time.sleep(0.02)
    r = ok(refund(w.bob, p["payment_id"], 300), 201)
    revs = revisions(w.bob, r["payment_id"])
    assert len(revs) == 1 and revs[0]["revision"] == 1 and revs[0]["amount"] == 300
    assert ts(revs[0]["effective_at"]) == ts(revs[0]["recorded_at"]) == ts(r["created_at"])
    assert me_at(w.ada, before(r["created_at"], milliseconds=1))["balance"] == 9000
    assert me_at(w.ada, r["created_at"])["balance"] == 9300
    assert me_at(w.bob, before(r["created_at"], milliseconds=1))["balance"] == 3500
    assert me_at(w.bob, r["created_at"])["balance"] == 3200
    for c, delta in ((w.ada, 300), (w.bob, -300)):
        e = [x for x in statement(c)["entries"] if x["payment"]["payment_id"] == r["payment_id"]]
        assert len(e) == 1 and e[0]["delta"] == delta
    ok(correct(w.ada, p["payment_id"], 1, 1500, p["created_at"]), 201)
    assert [x["amount"] for x in revisions(w.ada, r["payment_id"])] == [300]
    e = [x for x in statement(w.ada)["entries"] if x["payment"]["payment_id"] == r["payment_id"]]
    assert e[0]["delta"] == 300 and e[0]["payment"]["amount"] == 300
    assert w.ada.balance() == 10000 - 1500 + 300
