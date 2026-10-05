"""Stage 2 API: holds, authorisations, captures, voids, expiry and the changed stage-1 API."""
import time

import pytest

from conftest import (assert_id, assert_timestamp, conserve, err, err_any, new_key, ok, ts,
                      user)
from s2 import (auth, authorize, auths_list, capture, fixture2, hours, me, void)

MAX = 1_000_000_000
AUTH_FIELDS = {"authorization_id", "from_user_id", "from_handle", "to_user_id", "to_handle",
               "amount", "captured_amount", "currency", "note", "visibility", "status",
               "expires_at", "payment_id", "created_at", "remaining_amount"}
PAYMENT_FIELDS = {"payment_id", "from_user_id", "from_handle", "to_user_id", "to_handle",
                  "amount", "currency", "note", "visibility", "request_id", "created_at",
                  "authorization_id"}


@pytest.fixture
def w(make_world):
    """ada 10000 (operator), bob 2500, cy 500, dan 0; default ttl."""
    from conftest import fixture
    return make_world(fixture(operators=["u_ada"]))


def held_conserve(w):
    """S2-080/S2-081 over every wallet: totals sum to the seed, available never negative,
    balance == total, available == total - held."""
    from conftest import seeded_total
    tot = 0
    for c in w.clients.values():
        m = me(c)
        assert m["balance"] == m["total"]
        assert m["available"] == m["total"] - m["held"]
        assert m["available"] >= 0 and m["held"] >= 0
        tot += m["total"]
    assert tot == seeded_total(w.fixture)


# ---- /me and the changed stage-1 API ------------------------------------------------

@pytest.mark.req("S2-084", "S2-099")
def test_me_without_holds(w):
    """S2-084 "With no open holds, `balance`, `total` and `available` agree and `held` is zero" """
    m = me(w.ada)
    assert (m["balance"], m["total"], m["available"], m["held"]) == (10000, 10000, 10000, 0)
    assert all(isinstance(m[k], int) for k in ("balance", "total", "available", "held"))
    assert m["currency"] == "EUR" and m["minor_units"] == 2 and m["handle"] == "ada"


@pytest.mark.req("S2-099", "S2-080", "S2-081")
def test_me_with_holds(w):
    """S2-099 "`held` is the sum of open holds, and `available` is `total − held`" """
    ok(authorize(w.ada, "bob", 2000), 201)
    ok(authorize(w.ada, "cy", 1500), 201)
    m = me(w.ada)
    assert (m["balance"], m["total"], m["held"], m["available"]) == (10000, 10000, 3500, 6500)
    assert me(w.bob)["held"] == 0 and me(w.bob)["available"] == 2500
    held_conserve(w)


@pytest.mark.req("S2-086", "S2-081")
def test_payments_are_judged_against_available(w):
    """S2-086 "`409 insufficient_funds` ... is now evaluated against `available`" — a payment
    above available but within total is refused; exactly available succeeds."""
    ok(authorize(w.cy, "bob", 300), 201)
    err(w.cy.pay("bob", 201), 409, "insufficient_funds")
    assert me(w.cy)["total"] == 500
    ok(w.cy.pay("bob", 200), 201)
    m = me(w.cy)
    assert (m["total"], m["held"], m["available"]) == (300, 300, 0)
    err(w.cy.pay("bob", 1), 409, "insufficient_funds")
    held_conserve(w)


@pytest.mark.req("S2-086", "S2-087")
def test_request_pay_judged_against_available(w):
    """S2-086 on `POST /requests/{id}/pay`; S2-087 "Paying a request remains immediate." """
    ok(authorize(w.cy, "ada", 400), 201)
    rid = ok(w.bob.ask("cy", 101), 201)["request_id"]
    err(w.cy.pay_request(rid), 409, "insufficient_funds")
    rid2 = ok(w.bob.ask("cy", 100), 201)["request_id"]
    p = ok(w.cy.pay_request(rid2), 201)
    assert p["authorization_id"] is None and p["request_id"] == rid2
    m = me(w.cy)
    assert (m["total"], m["held"], m["available"]) == (400, 400, 0)
    assert me(w.bob)["total"] == 2600


@pytest.mark.req("S2-086", "S2-081")
def test_settlement_net_debit_judged_against_available(w):
    """S2-081 "Held funds cannot fund ... settlement net debits." """
    ok(authorize(w.cy, "bob", 450), 201)
    err(w.ada.settle([{"from_handle": "cy", "to_handle": "dan", "amount": 51}]), 409,
        "insufficient_funds")
    ok(w.ada.settle([{"from_handle": "cy", "to_handle": "dan", "amount": 50}]), 201)
    # incoming in the same batch can fund it
    ok(w.ada.settle([{"from_handle": "dan", "to_handle": "cy", "amount": 50},
                     {"from_handle": "cy", "to_handle": "bob", "amount": 50}]), 201)
    m = me(w.cy)
    assert (m["total"], m["held"], m["available"]) == (450, 450, 0)
    held_conserve(w)


@pytest.mark.req("S2-081", "S2-103")
def test_held_funds_cannot_fund_another_authorization(w):
    """S2-081 / S2-103 "The caller's `available` is below `amount` | 409 `insufficient_funds`" """
    ok(authorize(w.cy, "bob", 400), 201)
    err(authorize(w.cy, "bob", 101), 409, "insufficient_funds")
    ok(authorize(w.cy, "ada", 100), 201)
    err(authorize(w.cy, "ada", 1), 409, "insufficient_funds")
    assert me(w.cy)["available"] == 0


@pytest.mark.req("S2-085")
def test_payments_leave_no_hold(w):
    """S2-085 "`POST /payments` remains an immediate transfer. It must not leave an
    intermediate hold" """
    p = ok(w.ada.pay("bob", 700), 201)
    assert p["authorization_id"] is None
    m = me(w.ada)
    assert (m["total"], m["held"], m["available"]) == (9300, 0, 9300)
    assert me(w.bob)["total"] == 3200
    assert auths_list(w.ada) == []


@pytest.mark.req("S2-088")
def test_splits_unchanged(w):
    """S2-088 "`POST /splits` is unchanged." — shares and requests as in stage 1; holds do
    not matter to a split."""
    ok(authorize(w.cy, "bob", 500), 201)
    sp = ok(w.cy.split(10, ["cy", "ada", "bob"]), 201)
    assert [s["amount"] for s in sp["shares"]] == [4, 3, 3]
    assert [r["amount"] for r in sp["requests"]] == [3, 3]


@pytest.mark.req("S2-113")
def test_payments_without_authorization_carry_null(w):
    """S2-113 "Payments created without an authorisation carry `authorization_id: null`" —
    direct, request-paid and settlement payments, in responses and the feed."""
    a = ok(w.ada.pay("bob", 1), 201)
    rid = ok(w.bob.ask("ada", 1), 201)["request_id"]
    b = ok(w.ada.pay_request(rid), 201)
    s = ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 1}]), 201)
    for p in (a, b, s["payments"][0]):
        assert "authorization_id" in p and p["authorization_id"] is None
    assert b["request_id"] == rid and a["request_id"] is None
    for item in w.cy.feed():
        assert item["authorization_id"] is None


# ---- POST /authorizations -------------------------------------------------------------

@pytest.mark.req("S2-100", "S2-101", "S2-102", "S2-121")
def test_authorize_shape(w):
    """S2-101 the 201 body; S2-102 "`expires_at` is `created_at` plus
    `authorization_ttl_seconds`" (default 600); S2-121 remaining_amount."""
    a = ok(authorize(w.ada, "bob", 2000, note="deposit", visibility="private"), 201)
    assert AUTH_FIELDS <= set(a)
    assert_id(a["authorization_id"])
    assert (a["from_user_id"], a["from_handle"], a["to_user_id"], a["to_handle"]) == \
        ("u_ada", "ada", "u_bob", "bob")
    assert a["amount"] == 2000 and a["captured_amount"] == 0 and a["remaining_amount"] == 2000
    assert a["currency"] == "EUR" and a["note"] == "deposit" and a["visibility"] == "private"
    assert a["status"] == "open" and a["payment_id"] is None
    assert_timestamp(a["created_at"])
    assert_timestamp(a["expires_at"])
    assert (ts(a["expires_at"]) - ts(a["created_at"])).total_seconds() == pytest.approx(600, abs=1)


@pytest.mark.req("S2-100", "S2-097")
def test_authorize_defaults(w):
    """S2-100 "`note` and `visibility` are optional with the same defaults as `POST /payments`." """
    a = ok(authorize(w.ada, "bob", 1), 201)
    assert a["note"] == "" and a["visibility"] == "public"


@pytest.mark.req("S2-090", "S2-102")
@pytest.mark.parametrize("ttl", [1, 3600, 86400 * 365])
def test_ttl_from_fixture(make_world, ttl):
    """S2-090 "`authorization_ttl_seconds` applies to every authorisation created through the
    API." """
    w = make_world(fixture2(ttl=ttl))
    a = ok(authorize(w.ada, "bob", 5), 201)
    assert (ts(a["expires_at"]) - ts(a["created_at"])).total_seconds() == pytest.approx(ttl, abs=1)


@pytest.mark.req("S2-100", "S2-089")
def test_authorize_needs_a_key(w):
    """S2-100 "`Idempotency-Key` is required." """
    err(w.ada.post("/authorizations", {"to_handle": "bob", "amount": 5}), 400,
        "missing_idempotency_key")
    err(authorize(w.ada, "bob", 5, key=""), 400, "missing_idempotency_key")
    err(authorize(w.ada, "bob", 5, key="k" * 256), 422, "validation_failed")
    assert me(w.ada)["held"] == 0


@pytest.mark.req("S2-104")
@pytest.mark.parametrize("amount", [0, -1, MAX + 1, 1.5, "10", True, None,
                                    0.5])
def test_authorize_amount_rules(w, amount):
    """S2-104 "`amount` below 1, above 1000000000, or not an integer | 422" """
    err(authorize(w.ada, "bob", amount), 422, "validation_failed")
    assert me(w.ada)["held"] == 0


@pytest.mark.req("S2-104", "S1-029")
@pytest.mark.parametrize("raw,good", [("1e3", 1000), ("1000.0", 1000),
                                      ("1.0000000000000001", None), ("1e400", None)])
def test_authorize_number_spellings(w, raw, good):
    """S2-104 with stage-1 §4 integral forms."""
    r = w.ada.request("POST", "/authorizations",
                      content=('{"to_handle":"bob","amount":%s}' % raw).encode(), key=new_key())
    if good:
        assert ok(r, 201)["amount"] == good
    else:
        err(r, 422, "validation_failed")


@pytest.mark.req("S2-105")
def test_authorize_self(w):
    """S2-105 "`to_handle` is the caller's own handle | 422 `self_payment`" """
    err(authorize(w.ada, "ada", 5), 422, "self_payment")


@pytest.mark.req("S2-106")
@pytest.mark.parametrize("fields", [{"note": "x" * 201}, {"note": "😀" * 201}, {"note": None},
                                    {"visibility": "friends"}, {"visibility": None}])
def test_authorize_note_visibility(w, fields):
    """S2-106 "`note` over 200 characters, or `visibility` neither `public` nor `private` | 422" """
    err(authorize(w.ada, "bob", 5, **fields), 422, "validation_failed")


@pytest.mark.req("S2-106", "S1-105")
def test_authorize_note_200_emoji_verbatim(w):
    """S2-106 200 characters is allowed, and the note is kept verbatim."""
    note = "😀" * 199 + " "
    a = ok(authorize(w.ada, "bob", 5, note=note), 201)
    assert a["note"] == note


@pytest.mark.req("S2-107")
def test_authorize_unknown_handle(w):
    """S2-107 "No user has that handle | 404 `not_found`" — on an endpoint that authorises a
    known handle."""
    ok(authorize(w.ada, "bob", 5), 201)
    err(authorize(w.ada, "ghost", 5), 404, "not_found")
    assert me(w.ada)["held"] == 5


@pytest.mark.req("S2-108")
def test_open_authorization_not_in_feed(w):
    """S2-108 "An open authorisation is **not** a feed item" """
    ok(authorize(w.ada, "bob", 5), 201)
    for c in w.clients.values():
        assert c.feed() == []


@pytest.mark.req("S2-089", "S2-100")
def test_authorize_idempotency(w):
    """S2-089 replay rules on authorizations: 200 identical, no second hold; different body
    409; key per user."""
    k = new_key()
    a = ok(authorize(w.ada, "bob", 300, key=k), 201)
    assert ok(authorize(w.ada, "bob", 300, key=k), 200) == a
    assert me(w.ada)["held"] == 300
    err(authorize(w.ada, "bob", 301, key=k), 409, "idempotency_key_reuse")
    err(authorize(w.ada, "bob", -5, key=k), 409, "idempotency_key_reuse")
    ok(authorize(w.bob, "ada", 300, key=k), 201)
    assert len(auths_list(w.ada, direction="outgoing")) == 1


# ---- capture ---------------------------------------------------------------------------

@pytest.mark.req("S2-109", "S2-112", "S2-114", "S2-082")
def test_full_capture(w):
    """S2-112 "Returns `201` with the created **payment** ... `authorization_id` set ...
    `request_id: null` ... `note` and `visibility` are copied"; S2-114 becomes `captured`;
    S2-082 captures spend the reserved money."""
    a = ok(authorize(w.cy, "bob", 500, note="deposit", visibility="private"), 201)
    assert me(w.cy)["available"] == 0
    p = ok(capture(w.bob, a["authorization_id"]), 201)
    assert PAYMENT_FIELDS <= set(p)
    assert p["authorization_id"] == a["authorization_id"] and p["request_id"] is None
    assert (p["from_handle"], p["to_handle"], p["amount"]) == ("cy", "bob", 500)
    assert p["note"] == "deposit" and p["visibility"] == "private"
    assert_timestamp(p["created_at"])
    m = me(w.cy)
    assert (m["total"], m["held"], m["available"]) == (0, 0, 0)
    assert me(w.bob)["total"] == 3000
    got = auths_list(w.bob)[0]
    assert got["status"] == "captured" and got["captured_amount"] == 500
    assert got["payment_id"] == p["payment_id"] and got["remaining_amount"] == 0
    feed_bob = {x["payment_id"]: x for x in w.bob.feed()}
    assert feed_bob[p["payment_id"]]["authorization_id"] == a["authorization_id"]
    assert w.ada.feed() == [], "private capture hidden from a third party"


@pytest.mark.req("S2-114", "S2-118")
def test_partial_final_capture_releases_remainder(w):
    """S2-114 "capturing 1500 of 2000 returns 500 to the payer's `available` in the same
    step." """
    a = ok(authorize(w.ada, "bob", 2000), 201)
    p = ok(capture(w.bob, a["authorization_id"], {"amount": 1500}), 201)
    assert p["amount"] == 1500
    m = me(w.ada)
    assert (m["total"], m["held"], m["available"]) == (8500, 0, 8500)
    got = auths_list(w.ada)[0]
    assert (got["status"], got["captured_amount"], got["remaining_amount"]) == \
        ("captured", 1500, 0)
    assert w.cy.feed()[0]["payment_id"] == p["payment_id"]


@pytest.mark.req("S2-115", "S2-083", "S2-125")
def test_second_capture_after_final(w):
    """S2-115 "A second capture after a final capture is `409 authorization_not_open`." """
    a = ok(authorize(w.ada, "bob", 2000), 201)
    ok(capture(w.bob, a["authorization_id"], {"amount": 100}), 201)
    err(capture(w.bob, a["authorization_id"], {"amount": 100}), 409, "authorization_not_open")
    err(capture(w.bob, a["authorization_id"]), 409, "authorization_not_open")
    assert me(w.bob)["total"] == 2600


@pytest.mark.req("S2-116", "S2-117", "S2-120", "S2-121")
def test_extended_capture_mode(w):
    """S2-116 "`final: false` ... status stays `open`; further captures are allowed up to that
    remainder." S2-117 "Capturing the entire remainder closes it even with `final: false`."
    S2-120 cumulative `captured_amount`, latest `payment_id`, `payment_ids` in order."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    p1 = ok(capture(w.bob, aid, {"amount": 700, "final": False}), 201)
    x = auths_list(w.bob)[0]
    assert (x["status"], x["captured_amount"], x["remaining_amount"]) == ("open", 700, 1300)
    assert x["payment_id"] == p1["payment_id"] and x["payment_ids"] == [p1["payment_id"]]
    m = me(w.ada)
    assert (m["total"], m["held"], m["available"]) == (9300, 1300, 8000)
    p2 = ok(capture(w.bob, aid, {"amount": 300, "final": False}), 201)
    p3 = ok(capture(w.bob, aid, {"amount": 1000, "final": False}), 201)
    x = auths_list(w.bob)[0]
    assert (x["status"], x["captured_amount"], x["remaining_amount"]) == ("captured", 2000, 0)
    assert x["payment_id"] == p3["payment_id"]
    assert x["payment_ids"] == [p1["payment_id"], p2["payment_id"], p3["payment_id"]]
    assert me(w.ada)["held"] == 0 and me(w.bob)["total"] == 4500
    err(capture(w.bob, aid, {"amount": 1, "final": False}), 409, "authorization_not_open")


@pytest.mark.req("S2-118", "S2-122")
def test_final_capture_after_partials_releases_rest(w):
    """S2-118 "A final capture closes it and releases any remainder." """
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    ok(capture(w.bob, aid, {"amount": 500, "final": False}), 201)
    ok(capture(w.bob, aid, {"amount": 500}), 201)
    x = auths_list(w.ada)[0]
    assert (x["status"], x["captured_amount"], x["remaining_amount"]) == ("captured", 1000, 0)
    m = me(w.ada)
    assert (m["total"], m["held"], m["available"]) == (9000, 0, 9000)


@pytest.mark.req("S2-110", "S2-119")
def test_omitted_amount_is_the_remainder(w):
    """S2-110 "`amount` is optional and defaults to the authorisation's remaining amount." """
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    ok(capture(w.bob, aid, {"amount": 600, "final": False}), 201)
    p = ok(capture(w.bob, aid, {}), 201)
    assert p["amount"] == 1400
    aid2 = ok(authorize(w.ada, "bob", 900), 201)["authorization_id"]
    ok(capture(w.bob, aid2, {"amount": 100, "final": False}), 201)
    p = ok(capture(w.bob, aid2, {"final": False}), 201)
    assert p["amount"] == 800
    assert auths_list(w.ada, status="captured")[0]["remaining_amount"] == 0


@pytest.mark.req("S2-119", "S2-127", "S2-083")
def test_capture_exceeds_remaining(w):
    """S2-119 "`capture_exceeds_authorization` compares with the **remaining** amount";
    S2-127 422 above the uncaptured remainder; nothing moves."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    err(capture(w.bob, aid, {"amount": 2001}), 422, "capture_exceeds_authorization")
    ok(capture(w.bob, aid, {"amount": 1500, "final": False}), 201)
    err(capture(w.bob, aid, {"amount": 501}), 422, "capture_exceeds_authorization")
    err(capture(w.bob, aid, {"amount": 501, "final": False}), 422,
        "capture_exceeds_authorization")
    ok(capture(w.bob, aid, {"amount": 500, "final": False}), 201)
    assert me(w.bob)["total"] == 4500 and me(w.ada)["total"] == 8000


@pytest.mark.req("S2-128")
@pytest.mark.parametrize("amount", [0, -1, 1.5, "100", True, None])
def test_capture_amount_rules(w, amount):
    """S2-128 "`amount` below 1, or not an integer | 422 `validation_failed`" """
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    err(capture(w.bob, aid, {"amount": amount}), 422, "validation_failed")
    assert auths_list(w.ada)[0]["status"] == "open"


@pytest.mark.req("S2-128", "S2-127")
def test_capture_amount_above_max_is_refused(w):
    """S2-127/S2-128: an amount above the remainder (here also above the stage-1 maximum) is
    refused with 422 — either code, since both rows describe it."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    err_any(capture(w.bob, aid, {"amount": MAX + 1}),
            {(422, "capture_exceeds_authorization"), (422, "validation_failed")})


@pytest.mark.req("S2-124")
@pytest.mark.parametrize("final", ["false", 0, None, "no", []])
def test_final_must_be_boolean(w, final):
    """S2-124 "`final` is boolean" — another JSON type is a field of the wrong type (§5 400);
    the body is not taken as final or non-final."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    err_any(capture(w.bob, aid, {"amount": 100, "final": final}),
            {(400, "malformed_request"), (422, "validation_failed")})
    assert auths_list(w.ada)[0]["captured_amount"] == 0


@pytest.mark.req("S2-111", "S2-123")
def test_capture_replay_body_identity(w):
    """S2-111 "`{}` and `{"amount": 2000}` are different JSON values" — reuse is 409; S2-123
    (D2-4) `{"amount": 700}` vs `{"amount": 700, "final": true}` is reuse too; the identical
    body replays as 200 with the original payment."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    k = new_key()
    first = ok(capture(w.bob, aid, {}, key=k), 201)
    err(capture(w.bob, aid, {"amount": 2000}, key=k), 409, "idempotency_key_reuse")
    assert ok(capture(w.bob, aid, {}, key=k), 200) == first
    aid2 = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    k2 = new_key()
    first2 = ok(capture(w.bob, aid2, {"amount": 700}, key=k2), 201)
    err(capture(w.bob, aid2, {"amount": 700, "final": True}, key=k2), 409,
        "idempotency_key_reuse")
    assert ok(capture(w.bob, aid2, {"amount": 700}, key=k2), 200) == first2


@pytest.mark.req("S2-083", "S2-089", "S2-109")
def test_capture_replay_moves_money_once(w):
    """S2-083 "Each idempotent capture moves money once." — replays after the authorisation
    closed still return 200 and the original payment."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    k = new_key()
    first = ok(capture(w.bob, aid, {"amount": 400, "final": False}, key=k), 201)
    for _ in range(3):
        assert ok(capture(w.bob, aid, {"amount": 400, "final": False}, key=k), 200) == first
    assert me(w.bob)["total"] == 2900
    ok(void(w.ada, aid), 200)
    assert ok(capture(w.bob, aid, {"amount": 400, "final": False}, key=k), 200) == first
    assert me(w.bob)["total"] == 2900 and me(w.ada)["held"] == 0


@pytest.mark.req("S2-109", "S2-089")
def test_capture_needs_a_key(w):
    """S2-109 "`Idempotency-Key` is required." """
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    err(w.bob.post(f"/authorizations/{aid}/capture", {}), 400, "missing_idempotency_key")


@pytest.mark.req("S2-129", "S2-134", "S2-109")
def test_only_the_receiver_captures(w):
    """S2-129 "The caller is not the receiver | 403 `forbidden`" — the payer and a third party."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    err(capture(w.ada, aid), 403, "forbidden")
    err(capture(w.cy, aid), 403, "forbidden")
    assert auths_list(w.ada)[0]["status"] == "open"


@pytest.mark.req("S2-130", "S2-165")
@pytest.mark.parametrize("aid", ["a_nope", "x" * 65])
def test_capture_and_void_unknown(w, aid):
    """S2-130 "Unknown authorisation | 404 `not_found`" — next to a known one that captures."""
    real = ok(authorize(w.ada, "bob", 5), 201)["authorization_id"]
    err(capture(w.bob, aid), 404, "not_found")
    ok(capture(w.bob, real), 201)
    err(void(w.bob, aid), 404, "not_found")


# ---- void --------------------------------------------------------------------------------

@pytest.mark.req("S2-131", "S2-132")
def test_void(w):
    """S2-131 "`200` with the authorisation, `status: "voided"`, the hold released." No key.
    S2-132 voiding again is 200 with the current state."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    v = ok(void(w.ada, aid), 200)
    assert v["status"] == "voided" and v["authorization_id"] == aid
    assert v["remaining_amount"] == 0 and v["captured_amount"] == 0
    assert me(w.ada)["held"] == 0 and me(w.ada)["available"] == 10000
    v2 = ok(void(w.ada, aid), 200)
    assert v2["status"] == "voided"
    err(capture(w.bob, aid), 409, "authorization_not_open")


@pytest.mark.req("S2-131", "S2-134")
def test_only_the_payer_voids(w):
    """S2-131 "**Only the payer may void**"; S2-134 403 for the receiver and third parties."""
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    err(void(w.bob, aid), 403, "forbidden")
    err(void(w.cy, aid), 403, "forbidden")
    assert me(w.ada)["held"] == 2000


@pytest.mark.req("S2-133")
def test_void_captured(w):
    """S2-133 "A `captured` ... one is `409 authorization_not_open`." """
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    ok(capture(w.bob, aid), 201)
    err(void(w.ada, aid), 409, "authorization_not_open")


@pytest.mark.req("S2-122", "S2-131")
def test_void_after_partial_capture(w):
    """S2-122 "Void ... can close a partially captured authorization, release only the
    remainder, and preserve all capture records." """
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    p = ok(capture(w.bob, aid, {"amount": 800, "final": False}), 201)
    v = ok(void(w.ada, aid), 200)
    assert (v["status"], v["captured_amount"], v["remaining_amount"]) == ("voided", 800, 0)
    assert v["payment_ids"] == [p["payment_id"]] and v["payment_id"] == p["payment_id"]
    m = me(w.ada)
    assert (m["total"], m["held"], m["available"]) == (9200, 0, 9200)
    assert p["payment_id"] in [x["payment_id"] for x in w.cy.feed()]


@pytest.mark.req("S2-131", "S2-089")
def test_void_needs_no_key_and_ignores_one(w):
    """S2-131 "No idempotency key, like decline and cancel." """
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    ok(w.ada.post(f"/authorizations/{aid}/void", key=new_key()), 200)


# ---- expiry --------------------------------------------------------------------------------

@pytest.mark.req("S2-097", "S2-126", "S2-133", "S2-138", "S2-098")
def test_clock_expiry_without_any_request(make_world):
    """S2-097 "Reads and writes must reflect expiry even if no request occurred at the
    deadline." (D2-2: ttl 2 s, then wait 3 s with no request.)"""
    w = make_world(fixture2(ttl=2))
    aid = ok(authorize(w.ada, "bob", 3000), 201)["authorization_id"]
    assert me(w.ada)["available"] == 7000
    time.sleep(3.2)
    m = me(w.ada)
    assert (m["total"], m["held"], m["available"]) == (10000, 0, 10000)
    x = auths_list(w.ada)[0]
    assert x["status"] == "expired" and x["remaining_amount"] == 0
    assert [a["authorization_id"] for a in auths_list(w.ada, status="expired")] == [aid]
    assert auths_list(w.ada, status="open") == []
    err(capture(w.bob, aid), 409, "authorization_expired")
    err(void(w.ada, aid), 409, "authorization_not_open")
    ok(w.ada.pay("bob", 10000), 201)


@pytest.mark.req("S2-097", "S2-086")
def test_expiry_is_seen_by_a_write_first(make_world):
    """S2-097 writes reflect expiry: the first request after the deadline is a payment that
    needs the released funds."""
    w = make_world(fixture2(ttl=2))
    ok(authorize(w.cy, "bob", 500), 201)
    err(w.cy.pay("bob", 1), 409, "insufficient_funds")
    time.sleep(3.2)
    ok(w.cy.pay("bob", 500), 201)


@pytest.mark.req("S2-122", "S2-097")
def test_expiry_after_partial_capture(make_world):
    """S2-122 expiry closes a partially captured authorisation, releases only the remainder,
    keeps the capture."""
    w = make_world(fixture2(ttl=2))
    aid = ok(authorize(w.ada, "bob", 2000), 201)["authorization_id"]
    p = ok(capture(w.bob, aid, {"amount": 300, "final": False}), 201)
    time.sleep(3.2)
    x = auths_list(w.bob)[0]
    assert (x["status"], x["captured_amount"], x["remaining_amount"]) == ("expired", 300, 0)
    assert x["payment_ids"] == [p["payment_id"]]
    m = me(w.ada)
    assert (m["total"], m["held"], m["available"]) == (9700, 0, 9700)


# ---- GET /authorizations ---------------------------------------------------------------------

@pytest.fixture
def several(w):
    ids = {}
    ids["out_bob"] = ok(authorize(w.ada, "bob", 100), 201)["authorization_id"]
    ids["in_bob"] = ok(authorize(w.bob, "ada", 200), 201)["authorization_id"]
    ids["out_cy_void"] = ok(authorize(w.ada, "cy", 300), 201)["authorization_id"]
    ok(void(w.ada, ids["out_cy_void"]), 200)
    ids["in_cy_cap"] = ok(authorize(w.cy, "ada", 400), 201)["authorization_id"]
    ok(capture(w.ada, ids["in_cy_cap"]), 201)
    ids["other"] = ok(authorize(w.bob, "cy", 5), 201)["authorization_id"]
    w.ids = ids
    return w


@pytest.mark.req("S2-135", "S2-136")
def test_list_only_own_newest_first(several):
    """S2-136 "Authorisations where the caller is the payer or the receiver, and no others.
    Newest first by `created_at`." """
    w, ids = several, several.ids
    body = ok(w.ada.get("/authorizations"), 200)
    assert set(body) >= {"authorizations", "has_more"} and body["has_more"] is False
    got = [a["authorization_id"] for a in body["authorizations"]]
    assert set(got) == {ids["out_bob"], ids["in_bob"], ids["out_cy_void"], ids["in_cy_cap"]}
    times = [ts(a["created_at"]) for a in body["authorizations"]]
    assert times == sorted(times, reverse=True)
    assert auths_list(w.dan) == []
    for a in body["authorizations"]:
        assert AUTH_FIELDS <= set(a)


@pytest.mark.req("S2-137")
def test_list_direction(several):
    """S2-137 "`direction` is `outgoing` (the caller is the payer), `incoming` (the caller is
    the receiver)" """
    w, ids = several, several.ids
    assert {a["authorization_id"] for a in auths_list(w.ada, direction="outgoing")} == \
        {ids["out_bob"], ids["out_cy_void"]}
    assert {a["authorization_id"] for a in auths_list(w.ada, direction="incoming")} == \
        {ids["in_bob"], ids["in_cy_cap"]}


@pytest.mark.req("S2-138")
@pytest.mark.parametrize("status,keys", [("open", {"out_bob", "in_bob"}),
                                         ("voided", {"out_cy_void"}),
                                         ("captured", {"in_cy_cap"}), ("expired", set())])
def test_list_status(several, status, keys):
    """S2-138 "`status` is one of the four statuses, or absent for all." """
    w, ids = several, several.ids
    assert {a["authorization_id"] for a in auths_list(w.ada, status=status)} == \
        {ids[k] for k in keys}


@pytest.mark.req("S2-139", "S2-166", "S1-069")
@pytest.mark.parametrize("params", [{"direction": "both"}, {"direction": ""},
                                    {"direction": "INCOMING"}, {"status": "pending"},
                                    {"status": "OPEN"}, {"status": ""}, {"limit": "0"},
                                    {"limit": "201"}, {"limit": "-5"}, {"offset": "-1"},
                                    {"limit": "1e1"}, {"limit": "4.0"}, {"offset": "+1"},
                                    {"offset": "abc"}, {"limit": "２"}])
def test_list_bad_params(w, params):
    """S2-139 "`limit`, `offset` and `has_more` behave exactly as on `GET /requests`." """
    err(w.ada.get("/authorizations", params=params), 422, "validation_failed")


@pytest.mark.req("S2-139")
def test_list_paging(w):
    """S2-139 default limit 50, has_more, offset."""
    for _ in range(51):
        ok(authorize(w.ada, "bob", 1), 201)
    body = ok(w.ada.get("/authorizations"), 200)
    assert len(body["authorizations"]) == 50 and body["has_more"] is True
    body = ok(w.ada.get("/authorizations", params={"offset": 50}), 200)
    assert len(body["authorizations"]) == 1 and body["has_more"] is False
    body = ok(w.ada.get("/authorizations", params={"limit": 51}), 200)
    assert body["has_more"] is False


@pytest.mark.req("S2-135", "S1-061")
def test_list_needs_auth(w):
    """S1-061 every new endpoint needs a bearer token."""
    err(w.ada.get("/authorizations", token=None), 401, "unauthenticated")
    err(w.ada.post("/authorizations", {"to_handle": "bob", "amount": 1}, key=new_key(),
                   token=None), 401, "unauthenticated")
    aid = ok(authorize(w.ada, "bob", 1), 201)["authorization_id"]
    err(w.bob.post(f"/authorizations/{aid}/capture", {}, key=new_key(), token="bad"), 401,
        "unauthenticated")
    err(w.ada.post(f"/authorizations/{aid}/void", token=None), 401, "unauthenticated")


# ---- content negotiation -----------------------------------------------------------------------

@pytest.mark.req("S2-009", "S2-140")
@pytest.mark.parametrize("path", ["/requests", "/authorizations"])
def test_html_for_browsers_json_otherwise(w, path):
    """S2-009 / S2-140 "Return the UI for `Accept: text/html`; API requests without that
    header receive JSON." """
    r = w.ada.get(path, headers={"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"})
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("text/html")
    for accept in (None, "application/json", "*/*"):
        h = {"Accept": accept} if accept else {}
        r = w.ada.get(path, headers=h)
        assert r.headers.get("content-type", "").startswith("application/json"), accept
        assert isinstance(r.json(), dict)
    # the JSON API still requires a token
    err(w.ada.get(path, token=None), 401, "unauthenticated")


# ---- seven idempotent paths ----------------------------------------------------------------------

@pytest.mark.req("S2-089")
def test_seven_paths_need_keys(w):
    """S2-089 "There are now seven idempotent write paths" — every one refuses a missing key."""
    rid = ok(w.bob.ask("ada", 1), 201)["request_id"]
    aid = ok(authorize(w.ada, "bob", 5), 201)["authorization_id"]
    for path, body, c in (("/payments", {"to_handle": "bob", "amount": 1}, w.ada),
                          ("/requests", {"payer_handle": "bob", "amount": 1, "note": ""}, w.ada),
                          (f"/requests/{rid}/pay", {}, w.ada),
                          ("/splits", {"amount": 2, "participant_handles": ["ada", "bob"],
                                       "note": ""}, w.ada),
                          ("/settlements", {"transfers": [
                              {"from_handle": "ada", "to_handle": "bob", "amount": 1}]}, w.ada),
                          ("/authorizations", {"to_handle": "bob", "amount": 1}, w.ada),
                          (f"/authorizations/{aid}/capture", {}, w.bob)):
        err(c.post(path, body), 400, "missing_idempotency_key")


@pytest.mark.req("S2-089", "S1-094")
def test_claimed_key_before_validation_on_new_paths(w):
    """S2-089 "The same replay rules apply" — §7's claimed-key-first rule on the new paths."""
    k = new_key()
    ok(authorize(w.ada, "bob", 5, key=k), 201)
    err(authorize(w.ada, "ghost", -1, key=k), 409, "idempotency_key_reuse")
    aid = ok(authorize(w.ada, "bob", 50), 201)["authorization_id"]
    k2 = new_key()
    ok(capture(w.bob, aid, {"amount": 10}, key=k2), 201)
    err(capture(w.bob, aid, {"amount": 999999}, key=k2), 409, "idempotency_key_reuse")
    err(w.bob.request("POST", f"/authorizations/{aid}/capture", content=b"{bad", key=k2), 400,
        "malformed_request")


@pytest.mark.req("S2-165")
def test_void_unknown_next_to_a_known_one(w):
    """S2-165 void of an unknown authorisation is 404, while a known one voids."""
    real = ok(authorize(w.ada, "bob", 5), 201)["authorization_id"]
    err(void(w.ada, "a_" + "z" * 30), 404, "not_found")
    err(void(w.ada, real + "x"), 404, "not_found")
    assert ok(void(w.ada, real), 200)["status"] == "voided"


@pytest.mark.req("S2-166")
def test_list_good_params_and_filters_together(w):
    """S2-166 valid forms are accepted: plain digits (leading zeros), each direction, each
    status, combined."""
    ok(authorize(w.ada, "bob", 5), 201)
    for params in ({"limit": "007"}, {"offset": "0"}, {"direction": "incoming"},
                   {"direction": "outgoing", "status": "open"}, {"status": "voided"},
                   {"status": "captured"}, {"status": "expired"}, {"offset": "9" * 30}):
        ok(w.ada.get("/authorizations", params=params), 200)
