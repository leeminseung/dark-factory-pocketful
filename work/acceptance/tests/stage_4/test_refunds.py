"""Stage 4: refunds, and the correction rules they change."""
import pytest

from conftest import (Api, assert_timestamp, burst, err, err_any, fixture, new_key, ok, ts,
                      user)
from s2 import authorize, auths_list, capture, fixture2, me
from s3 import correct, revisions, statement
from s4 import refund

PAYMENT_FIELDS = {"payment_id", "from_user_id", "from_handle", "to_user_id", "to_handle",
                  "amount", "currency", "note", "visibility", "request_id", "created_at",
                  "authorization_id", "refund_of"}


@pytest.fixture
def w(make_world):
    return make_world(fixture2(operators=["u_ada"]))


@pytest.mark.req("S4-008", "S4-003")
def test_refund_is_a_reverse_payment(w):
    """S4-008 "A refund is a new payment in the opposite direction, with `refund_of` naming the
    target, `request_id: null`, `authorization_id: null`, and the original note/visibility." """
    p = ok(w.ada.pay("bob", 1000, note="dinner 🍝", visibility="private"), 201)
    r = ok(refund(w.bob, p["payment_id"], 200), 201)
    assert PAYMENT_FIELDS <= set(r)
    assert (r["from_handle"], r["to_handle"], r["from_user_id"], r["to_user_id"]) == \
        ("bob", "ada", "u_bob", "u_ada")
    assert r["amount"] == 200 and r["refund_of"] == p["payment_id"]
    assert r["request_id"] is None and r["authorization_id"] is None
    assert r["note"] == "dinner 🍝" and r["visibility"] == "private"
    assert r["payment_id"] != p["payment_id"] and r["currency"] == "EUR"
    assert_timestamp(r["created_at"])
    assert w.ada.balance() == 9200 and w.bob.balance() == 3300
    assert {x["payment_id"] for x in w.ada.feed()} == {p["payment_id"], r["payment_id"]}
    assert w.cy.feed() == [], "a private refund is hidden from third parties"
    s = statement(w.bob)
    assert [e["delta"] for e in s["entries"]] == [1000, -200]
    assert s["entries"][1]["payment"]["refund_of"] == p["payment_id"]


@pytest.mark.req("S4-012")
def test_other_payments_have_refund_of_null(w):
    """S4-012 "Other payments have `refund_of: null`." — every endpoint returning a payment."""
    out = [ok(w.ada.pay("bob", 1), 201)]
    rid = ok(w.bob.ask("ada", 1), 201)["request_id"]
    out.append(ok(w.ada.pay_request(rid), 201))
    out += ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 1}]), 201)["payments"]
    aid = ok(authorize(w.ada, "bob", 5), 201)["authorization_id"]
    out.append(ok(capture(w.bob, aid), 201))
    out += w.ada.feed() + [e["payment"] for e in statement(w.ada)["entries"]]
    for p in out:
        assert "refund_of" in p and p["refund_of"] is None, p


@pytest.mark.req("S4-003", "S4-002", "S4-009")
def test_refund_key_and_replay(w):
    """S4-003 key required; S4-009 "replay returns 200 with the original body"; different body
    is 409; a refused refund claims no key."""
    p = ok(w.ada.pay("bob", 1000), 201)
    err(w.bob.post(f"/payments/{p['payment_id']}/refunds", {"amount": 5}), 400,
        "missing_idempotency_key")
    k = new_key()
    err(refund(w.bob, p["payment_id"], 2000, key=k), 422, "refund_exceeds_payment")
    first = ok(refund(w.bob, p["payment_id"], 300, key=k), 201)
    assert ok(refund(w.bob, p["payment_id"], 300, key=k), 200) == first
    err(refund(w.bob, p["payment_id"], 301, key=k), 409, "idempotency_key_reuse")
    assert w.bob.balance() == 3200 and len(w.bob.feed()) == 2


@pytest.mark.req("S4-004")
def test_only_the_receiver_refunds(w):
    """S4-004 "Only the original receiver may refund, else 403 `forbidden`; unknown payment is
    404." """
    p = ok(w.ada.pay("bob", 1000), 201)
    err(refund(w.ada, p["payment_id"], 5), 403, "forbidden")
    err(refund(w.cy, p["payment_id"], 5), 403, "forbidden")
    err(refund(w.bob, "p_nope", 5), 404, "not_found")
    err(w.bob.post(f"/payments/{p['payment_id']}/refunds", {"amount": 5}, key=new_key(),
                   token=None), 401, "unauthenticated")
    assert w.bob.balance() == 3500


@pytest.mark.req("S4-005")
def test_refund_targets(w):
    """S4-005 "The target may be a direct payment, request payment or capture, but never a
    refund." """
    rid = ok(w.bob.ask("ada", 400), 201)["request_id"]
    rp = ok(w.ada.pay_request(rid), 201)
    ok(refund(w.bob, rp["payment_id"], 100), 201)
    aid = ok(authorize(w.ada, "bob", 500), 201)["authorization_id"]
    cp = ok(capture(w.bob, aid, {"amount": 300}), 201)
    cr = ok(refund(w.bob, cp["payment_id"], 50), 201)
    assert cr["refund_of"] == cp["payment_id"] and cr["authorization_id"] is None
    err(refund(w.ada, cr["payment_id"], 10), 422, "invalid_refund_target")
    err(refund(w.ada, cr["payment_id"], 50, key=new_key()), 422, "invalid_refund_target")


@pytest.mark.req("S4-006")
@pytest.mark.parametrize("amount", [0, -1, 1.5, "10", True, None, [5]])
def test_refund_amount_rules(w, amount):
    """S4-006 "Invalid amount is 422 `validation_failed`." (D4-1)"""
    p = ok(w.ada.pay("bob", 1000), 201)
    err(refund(w.bob, p["payment_id"], amount), 422, "validation_failed")
    assert w.bob.balance() == 3500


@pytest.mark.req("S4-006", "S4-007")
def test_refund_amount_above_maximum(make_world):
    """S4-006 / S4-007: an amount above 1000000000 is refused with 422 (either code)."""
    w = make_world(fixture2(users=[user("ada", 10 ** 9), user("bob", 10 ** 9)]))
    p = ok(w.ada.pay("bob", 10 ** 9), 201)
    err_any(refund(w.bob, p["payment_id"], 10 ** 9 + 1),
            {(422, "validation_failed"), (422, "refund_exceeds_payment")})
    ok(refund(w.bob, p["payment_id"], 10 ** 9), 201)


@pytest.mark.req("S4-007")
def test_cumulative_refunds(w):
    """S4-007 "Refunds cumulatively may not exceed the payment's current corrected amount" """
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(refund(w.bob, p["payment_id"], 600), 201)
    err(refund(w.bob, p["payment_id"], 401), 422, "refund_exceeds_payment")
    ok(refund(w.bob, p["payment_id"], 400), 201)
    err(refund(w.bob, p["payment_id"], 1), 422, "refund_exceeds_payment")
    assert w.ada.balance() == 10000 and w.bob.balance() == 2500


@pytest.mark.req("S4-007", "S4-014")
def test_refund_limit_follows_corrections(w):
    """S4-007 "the payment's current corrected amount"; S4-014 "A correction cannot reduce a
    payment below its already-refunded amount: 422 `refund_exceeds_payment`." """
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(refund(w.bob, p["payment_id"], 300), 201)
    err(correct(w.ada, p["payment_id"], 1, 299, p["created_at"]), 422, "refund_exceeds_payment")
    ok(correct(w.ada, p["payment_id"], 1, 500, p["created_at"]), 201)
    err(refund(w.bob, p["payment_id"], 201), 422, "refund_exceeds_payment")
    ok(refund(w.bob, p["payment_id"], 200), 201)
    ok(correct(w.ada, p["payment_id"], 2, 500, p["created_at"]), 201)
    err(correct(w.ada, p["payment_id"], 3, 499, p["created_at"]), 422, "refund_exceeds_payment")
    assert w.ada.balance() == 10000 - 500 + 500 and w.bob.balance() == 2500


@pytest.mark.req("S4-010")
def test_refund_from_available_funds(w):
    """S4-010 "It moves existing money from the receiver's **available** funds, or fails 409
    `insufficient_funds`, atomically." """
    p = ok(w.ada.pay("bob", 1000), 201)            # bob 3500
    ok(authorize(w.bob, "cy", 2900), 201)          # bob available 600
    err(refund(w.bob, p["payment_id"], 601), 409, "insufficient_funds")
    assert me(w.bob)["total"] == 3500 and len(w.bob.feed()) == 1
    ok(refund(w.bob, p["payment_id"], 600), 201)
    assert me(w.bob)["available"] == 0


@pytest.mark.req("S4-011")
def test_refunds_reopen_nothing(w):
    """S4-011 "Refunds never reopen a request or authorization or restore a released hold." """
    rid = ok(w.bob.ask("ada", 400), 201)["request_id"]
    rp = ok(w.ada.pay_request(rid), 201)
    ok(refund(w.bob, rp["payment_id"], 400), 201)
    r = next(x for x in w.ada.requests_list() if x["request_id"] == rid)
    assert r["status"] == "paid" and r["payment_id"] == rp["payment_id"]
    aid = ok(authorize(w.ada, "bob", 500), 201)["authorization_id"]
    cp = ok(capture(w.bob, aid, {"amount": 300}), 201)       # final: 200 released
    ok(refund(w.bob, cp["payment_id"], 300), 201)
    a = auths_list(w.ada)[0]
    assert (a["status"], a["captured_amount"], a["remaining_amount"]) == ("captured", 300, 0)
    assert me(w.ada)["held"] == 0
    err(capture(w.bob, aid), 409, "authorization_not_open")


@pytest.mark.req("S4-013")
def test_refunds_and_captures_cannot_be_corrected(w):
    """S4-013 "Captures and refund payments cannot themselves be corrected: 422
    `linked_payment_immutable`." — the refund's sender (the receiver) tries."""
    p = ok(w.ada.pay("bob", 1000), 201)
    r = ok(refund(w.bob, p["payment_id"], 100), 201)
    err(correct(w.bob, r["payment_id"], 1, 50, r["created_at"]), 422, "linked_payment_immutable")
    aid = ok(authorize(w.ada, "bob", 500), 201)["authorization_id"]
    cp = ok(capture(w.bob, aid), 201)
    err(correct(w.ada, cp["payment_id"], 1, 1, cp["created_at"]), 422, "linked_payment_immutable")
    rid = ok(w.bob.ask("ada", 70), 201)["request_id"]
    rp = ok(w.ada.pay_request(rid), 201)
    ok(correct(w.ada, rp["payment_id"], 1, 60, rp["created_at"]), 201)
    assert len(revisions(w.bob, r["payment_id"])) == 1


@pytest.mark.req("S4-015")
def test_correction_debit_against_available(w):
    """S4-015 "Correction debits are checked against available funds." """
    p = ok(w.ada.pay("bob", 1000), 201)
    ok(authorize(w.bob, "cy", 3000), 201)          # bob available 500
    err(correct(w.ada, p["payment_id"], 1, 400, p["created_at"]), 409, "insufficient_funds")
    ok(correct(w.ada, p["payment_id"], 1, 500, p["created_at"]), 201)


@pytest.mark.req("S4-034")
def test_settlement_member_refund(w):
    """S4-034 "A settlement payment may be refunded under the existing refund rules, but refunds
    never change settlement membership." (D4-3)"""
    s = ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 300},
                         {"from_handle": "cy", "to_handle": "dan", "amount": 100}]), 201)
    m1 = s["payments"][0]
    r = ok(refund(w.cy, m1["payment_id"], 120), 201)
    assert r["settlement_id"] is None and r["refund_of"] == m1["payment_id"]
    err(refund(w.cy, m1["payment_id"], 181), 422, "refund_exceeds_payment")
    assert ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 300},
                            {"from_handle": "cy", "to_handle": "dan", "amount": 100}]),
              201)["settlement_id"] != s["settlement_id"]
    members = [x for x in w.cy.feed() if x["settlement_id"] == s["settlement_id"]]
    assert {m["payment_id"] for m in members} == {p["payment_id"] for p in s["payments"]}


@pytest.mark.req("S4-010", "S1-001", "S1-002")
def test_concurrent_refunds_never_exceed(make_world):
    """S4-007 / S4-010 under load: 30 concurrent refunds of 50 against a 1000 payment — at most
    20 succeed; totals hold."""
    w = make_world(fixture2(users=[user("ada", 10000), user("bob", 0)]))
    p = ok(w.ada.pay("bob", 1000), 201)
    cs = [Api(w.bob.base_url, w.bob.token) for _ in range(30)]
    try:
        out = burst(lambda i: refund(cs[i], p["payment_id"], 50), 30)
    finally:
        for c in cs:
            c.close()
    n = sum(r.status_code == 201 for r in out)
    assert n == 20, [r.status_code for r in out]
    assert w.bob.balance() == 0 and w.ada.balance() == 10000
