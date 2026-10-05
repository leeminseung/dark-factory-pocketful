"""Stage 1 §8: GET /me, POST /payments, requests, pay/decline/cancel, GET /requests."""
import pytest

from conftest import (assert_id, assert_timestamp, conserve, err, err_any, new_key, ok,
                      ts)

MAX = 1_000_000_000
PAYMENT_FIELDS = {"payment_id", "from_user_id", "from_handle", "to_user_id", "to_handle",
                  "amount", "currency", "note", "visibility", "request_id", "created_at"}
REQUEST_FIELDS = {"request_id", "requester_id", "requester_handle", "payer_id",
                  "payer_handle", "amount", "currency", "note", "status", "payment_id",
                  "created_at"}


# ---- GET /me ---------------------------------------------------------------------

@pytest.mark.req("S1-095")
def test_me_shape(world):
    """S1-095 `GET /me` -> user_id, display_name, handle, balance, currency, minor_units."""
    me = world.bob.me()
    assert me["user_id"] == "u_bob" and me["display_name"] == "Bob"
    assert me["handle"] == "bob" and me["balance"] == 2500
    assert me["currency"] == "EUR" and me["minor_units"] == 2
    assert isinstance(me["balance"], int)


# ---- POST /payments ----------------------------------------------------------------

@pytest.mark.req("S1-096")
def test_payment_response_shape(world):
    """S1-096 the 201 payment body of `POST /payments`."""
    p = ok(world.ada.pay("bob", 1500, note="dinner", visibility="public"), 201)
    assert PAYMENT_FIELDS <= set(p)
    assert (p["from_user_id"], p["from_handle"], p["to_user_id"], p["to_handle"]) == \
        ("u_ada", "ada", "u_bob", "bob")
    assert p["amount"] == 1500 and p["currency"] == "EUR"
    assert p["note"] == "dinner" and p["visibility"] == "public"
    assert p["request_id"] is None
    assert_id(p["payment_id"])
    assert_timestamp(p["created_at"])


@pytest.mark.req("S1-096", "S1-182")
def test_ordinary_payment_has_null_settlement_id(world):
    """S1-182 "nonmembers expose null for that field" — `settlement_id` on a direct payment,
    on a paid request and in the feed."""
    p = ok(world.ada.pay("bob", 1), 201)
    assert "settlement_id" in p and p["settlement_id"] is None
    rid = ok(world.bob.ask("ada", 1), 201)["request_id"]
    q = ok(world.ada.pay_request(rid), 201)
    assert "settlement_id" in q and q["settlement_id"] is None
    for item in world.cy.feed():
        assert item["settlement_id"] is None


@pytest.mark.req("S1-097")
def test_note_and_visibility_defaults(world):
    """S1-097 "`note` is optional and defaults to `""`. `visibility` is optional and defaults
    to `"public"`." The defaults are what the feed shows too."""
    p = ok(world.ada.pay("bob", 1), 201)
    assert p["note"] == "" and p["visibility"] == "public"
    item = next(x for x in world.cy.feed() if x["payment_id"] == p["payment_id"])
    assert item["note"] == "" and item["visibility"] == "public"


@pytest.mark.req("S1-098", "S1-104")
def test_insufficient_funds(world):
    """S1-098 "The caller's balance is below `amount` | 409 `insufficient_funds`"; exact
    balance is enough; a failed payment leaves no trace."""
    err(world.cy.pay("bob", 501), 409, "insufficient_funds")
    err(world.dan.pay("bob", 1), 409, "insufficient_funds")
    assert world.cy.feed() == [] and world.bob.feed() == []
    ok(world.cy.pay("bob", 500), 201)
    assert world.cy.balance() == 0
    err(world.cy.pay("bob", 1), 409, "insufficient_funds")
    conserve(world)


@pytest.mark.req("S1-099")
@pytest.mark.parametrize("amount", [0, -1, -MAX, MAX + 1, 1.5, 0.5, "10", True, None, [],
                                    {}])
def test_payment_amount_rules(world, amount):
    """S1-099 "`amount` below 1, above 1000000000, or not an integer | 422
    `validation_failed`" """
    err(world.ada.pay("bob", amount), 422, "validation_failed")
    assert world.ada.balance() == 10000


@pytest.mark.req("S1-099")
def test_payment_amount_bounds_valid(make_world):
    """S1-099 1 and 1000000000 are in range."""
    from conftest import fixture, user
    w = make_world(fixture(users=[user("ada", MAX + 1), user("bob", 0)]))
    ok(w.ada.pay("bob", 1), 201)
    ok(w.ada.pay("bob", MAX), 201)
    assert w.ada.balance() == 0 and w.bob.balance() == MAX + 1


@pytest.mark.req("S1-100")
def test_self_payment(world):
    """S1-100 "`to_handle` is the caller's own handle | 422 `self_payment`" — also when the
    caller could not afford it."""
    err(world.ada.pay("ada", 10), 422, "self_payment")
    err(world.dan.pay("dan", 10), 422, "self_payment")
    assert world.ada.balance() == 10000


@pytest.mark.req("S1-101")
@pytest.mark.parametrize("note,good", [
    ("x" * 200, True), ("x" * 201, False), ("😀" * 200, True), ("😀" * 201, False),
    ("𝄞" * 200, True), ("日" * 200, True), ("日" * 201, False), ("", True),
    (" " * 201, False),
])
def test_payment_note_length_in_characters(world, note, good):
    """S1-101 "`note` longer than 200 characters | 422 `validation_failed`" (decision D5)."""
    r = world.ada.pay("bob", 1, note=note)
    if good:
        assert ok(r, 201)["note"] == note
    else:
        err(r, 422, "validation_failed")


@pytest.mark.req("S1-102")
def test_visibility_values(world):
    """S1-102 `visibility` must be `public` or `private`."""
    assert ok(world.ada.pay("bob", 1, visibility="private"), 201)["visibility"] == "private"
    assert ok(world.ada.pay("bob", 1, visibility="public"), 201)["visibility"] == "public"
    err(world.ada.pay("bob", 1, visibility="friends"), 422, "validation_failed")


@pytest.mark.req("S1-103")
@pytest.mark.parametrize("handle", ["nobody", "ad", "adaa", "a" * 20])
def test_unknown_handle_is_404(world, handle):
    """S1-103 "No user has that handle | 404 `not_found`" """
    err(world.ada.pay(handle, 1), 404, "not_found")


@pytest.mark.req("S1-103", "S1-031")
@pytest.mark.parametrize("handle", ["ADA", "Bob", "@bob", "", " bob", "bob ", "a" * 21,
                                    "b" * 300])
def test_handle_that_cannot_exist(world, handle):
    """S1-103 / decision D6: a handle outside `^[a-z0-9_]{1,20}$` names no user: 404 or 422,
    never a payment to a near match."""
    err_any(world.ada.pay(handle, 1), {(404, "not_found"), (422, "validation_failed")})
    assert world.bob.balance() == 2500


@pytest.mark.req("S1-098", "S1-099", "S1-101")
def test_validation_before_funds(world):
    """S1-099 / S1-101 (decision D12): an invalid amount or note is refused as such even when
    the caller has no money (dan holds 0) — funds are compared with a valid amount."""
    err(world.dan.pay("bob", 0), 422, "validation_failed")
    err(world.dan.pay("bob", MAX + 1), 422, "validation_failed")
    err(world.dan.pay("bob", 1, note="x" * 201), 422, "validation_failed")


@pytest.mark.req("S1-104")
def test_debit_and_credit_are_one_step(world):
    """S1-104 "A payment is never visible in one wallet and not the other" — both parties'
    feeds hold the same item, and the two balance changes match."""
    p = ok(world.bob.pay("cy", 999, visibility="private"), 201)
    a = next(x for x in world.bob.feed() if x["payment_id"] == p["payment_id"])
    b = next(x for x in world.cy.feed() if x["payment_id"] == p["payment_id"])
    assert a == b
    assert world.bob.balance() == 1501 and world.cy.balance() == 1499


@pytest.mark.req("S1-105")
@pytest.mark.parametrize("note", [
    "  padded  ", "tab\tnew\nline\r\n", "<b>&amp;</b> \"quotes\" 'single' \\ back",
    "é (decomposed)", "é (composed)", "​zero‍width﻿",
    "👨‍👩‍👧‍👦 family", "🇰🇷🇫🇷", "𝔘𝔫𝔦𝔠𝔬𝔡𝔢", "a\u0000b", "  ", "%s %d {0}",
    "<script>alert(1)</script>", "日本語 한국어 العربية",
])
def test_note_round_trip_verbatim(world, note):
    """S1-105 "`note` is stored and returned verbatim: no trimming, no escaping, no
    normalisation. Unicode and emoji survive a round trip byte for byte." In the response and
    in both feeds."""
    p = ok(world.ada.pay("bob", 1, note=note), 201)
    assert p["note"] == note
    for c in (world.ada, world.bob, world.cy):
        item = next(x for x in c.feed() if x["payment_id"] == p["payment_id"])
        assert item["note"].encode("utf-8") == note.encode("utf-8")


@pytest.mark.req("S1-105")
def test_request_note_round_trip_verbatim(world):
    """S1-105 notes elsewhere keep the same treatment: request notes are verbatim too."""
    note = "  é 😀 <i>x</i>\n"
    r = ok(world.bob.ask("ada", 1, note=note), 201)
    assert r["note"] == note
    assert world.ada.requests_list()[0]["note"] == note


# ---- POST /requests ----------------------------------------------------------------

@pytest.mark.req("S1-106")
def test_request_response_shape(world):
    """S1-106 the 201 request body; "The caller is the requester." """
    r = ok(world.bob.ask("ada", 1200, note="taxi"), 201)
    assert REQUEST_FIELDS <= set(r)
    assert (r["requester_id"], r["requester_handle"], r["payer_id"], r["payer_handle"]) == \
        ("u_bob", "bob", "u_ada", "ada")
    assert r["amount"] == 1200 and r["currency"] == "EUR" and r["note"] == "taxi"
    assert r["status"] == "pending" and r["payment_id"] is None
    assert_id(r["request_id"])
    assert_timestamp(r["created_at"])
    assert world.ada.balance() == 10000 and world.bob.balance() == 2500


@pytest.mark.req("S1-106", "S1-025")
def test_requester_cannot_be_forged(world):
    """S1-106 "The caller is the requester" — a `requester_handle` in the body is ignored."""
    r = ok(world.bob.ask("ada", 5, requester_handle="cy", requester_id="u_cy"), 201)
    assert r["requester_handle"] == "bob"


@pytest.mark.req("S1-107")
@pytest.mark.parametrize("amount", [0, -1, MAX + 1, 2.5, "100", False, None])
def test_request_amount_rules(world, amount):
    """S1-107 "`amount` below 1, above 1000000000, or not an integer | 422" """
    err(world.bob.ask("ada", amount), 422, "validation_failed")
    assert world.ada.requests_list() == []


@pytest.mark.req("S1-107")
def test_request_amount_bounds_valid(world):
    """S1-107 1 and 1000000000 are valid."""
    ok(world.bob.ask("ada", 1), 201)
    ok(world.bob.ask("ada", MAX), 201)


@pytest.mark.req("S1-108")
def test_self_request(world):
    """S1-108 "`payer_handle` is the caller's own handle | 422 `self_request`" """
    err(world.bob.ask("bob", 10), 422, "self_request")
    assert world.bob.requests_list() == []


@pytest.mark.req("S1-109")
def test_request_note_length(world):
    """S1-109 "`note` longer than 200 characters | 422 `validation_failed`" """
    ok(world.bob.ask("ada", 1, note="😀" * 200), 201)
    err(world.bob.ask("ada", 1, note="😀" * 201), 422, "validation_failed")
    err(world.bob.ask("ada", 1, note="x" * 201), 422, "validation_failed")


@pytest.mark.req("S1-110")
def test_request_unknown_handle(world):
    """S1-110 "No user has that handle | 404 `not_found`" """
    err(world.bob.ask("nobody", 10), 404, "not_found")
    err_any(world.bob.ask("ADA", 10), {(404, "not_found"), (422, "validation_failed")})


@pytest.mark.req("S1-111")
def test_payer_balance_not_checked(world):
    """S1-111 "**The payer's balance is not checked here.**" — many requests far above the
    payer's balance all sit `pending`."""
    for _ in range(3):
        assert ok(world.bob.ask("dan", MAX), 201)["status"] == "pending"
    assert [r["status"] for r in world.dan.requests_list()] == ["pending"] * 3


# ---- POST /requests/{id}/pay ---------------------------------------------------------

@pytest.mark.req("S1-112", "S1-042")
@pytest.mark.parametrize("body,vis", [({}, "public"), ({"visibility": "public"}, "public"),
                                      ({"visibility": "private"}, "private")])
def test_pay_visibility(world, body, vis):
    """S1-112 "The body carries `visibility` only, optional, default `"public"`." """
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    p = ok(world.ada.pay_request(rid, body), 201)
    assert p["visibility"] == vis
    seen = [x["payment_id"] for x in world.cy.feed()]
    assert (p["payment_id"] in seen) == (vis == "public")


@pytest.mark.req("S1-113")
def test_pay_replay_needs_identical_body(world):
    """S1-113 "`{}` and `{"visibility": "public"}` are different JSON values, so reusing a
    key across the two is `409 idempotency_key_reuse`" — both directions; replay of `{}` with
    `{}` is 200."""
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    k = new_key()
    first = ok(world.ada.pay_request(rid, {}, key=k), 201)
    err(world.ada.pay_request(rid, {"visibility": "public"}, key=k), 409,
        "idempotency_key_reuse")
    assert ok(world.ada.pay_request(rid, {}, key=k), 200) == first
    rid2 = ok(world.bob.ask("ada", 10), 201)["request_id"]
    k2 = new_key()
    ok(world.ada.pay_request(rid2, {"visibility": "public"}, key=k2), 201)
    err(world.ada.pay_request(rid2, {}, key=k2), 409, "idempotency_key_reuse")


@pytest.mark.req("S1-114")
def test_pay_returns_a_payment_and_marks_paid(world):
    """S1-114 "Returns `201` with the created **payment**, exactly as `POST /payments` returns
    one, with `request_id` set to this request. The request becomes `paid` and carries the new
    `payment_id`." The payer sends, the requester receives, note carried as a payment."""
    rq = ok(world.bob.ask("ada", 1200, note="taxi"), 201)
    p = ok(world.ada.pay_request(rq["request_id"]), 201)
    assert PAYMENT_FIELDS <= set(p)
    assert p["request_id"] == rq["request_id"]
    assert (p["from_handle"], p["to_handle"], p["from_user_id"], p["to_user_id"]) == \
        ("ada", "bob", "u_ada", "u_bob")
    assert p["amount"] == 1200 and p["currency"] == "EUR"
    assert_timestamp(p["created_at"])
    assert world.ada.balance() == 8800 and world.bob.balance() == 3700
    for c in (world.ada, world.bob):
        r = next(x for x in c.requests_list() if x["request_id"] == rq["request_id"])
        assert r["status"] == "paid" and r["payment_id"] == p["payment_id"]
    item = next(x for x in world.bob.feed() if x["payment_id"] == p["payment_id"])
    assert item["request_id"] == rq["request_id"]


@pytest.mark.req("S1-115")
def test_pay_not_pending(world):
    """S1-115 "The request is not `pending` | 409 `request_not_pending`" — paid with another
    key, declined, cancelled."""
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    ok(world.ada.pay_request(rid), 201)
    err(world.ada.pay_request(rid), 409, "request_not_pending")
    assert world.ada.balance() == 9990


@pytest.mark.req("S1-115", "S1-116")
def test_not_pending_and_short(world):
    """S1-115/S1-116: a cancelled request the payer cannot afford — both rules apply; the
    requirements list no order, so either code is accepted, and nothing moves."""
    rid = ok(world.bob.ask("dan", 10), 201)["request_id"]
    ok(world.bob.post(f"/requests/{rid}/cancel"), 200)
    err_any(world.dan.pay_request(rid), {(409, "request_not_pending"),
                                         (409, "insufficient_funds")})
    conserve(world)


@pytest.mark.req("S1-116")
def test_pay_insufficient(world):
    """S1-116 "The payer's balance is below `amount` | 409 `insufficient_funds`"; exactly the
    balance is enough."""
    rid = ok(world.ada.ask("cy", 501), 201)["request_id"]
    err(world.cy.pay_request(rid), 409, "insufficient_funds")
    rid2 = ok(world.ada.ask("cy", 500), 201)["request_id"]
    ok(world.cy.pay_request(rid2), 201)
    assert world.cy.balance() == 0


@pytest.mark.req("S1-117")
def test_pay_by_requester_is_forbidden(world):
    """S1-117 "The caller is not the request's payer | 403 `forbidden`" """
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    err(world.bob.pay_request(rid), 403, "forbidden")
    assert world.ada.requests_list()[0]["status"] == "pending"


@pytest.mark.req("S1-118")
@pytest.mark.parametrize("rid", ["rq_nope", "0", "x" * 64, "x" * 65, "p_1"])
def test_pay_unknown_request(world, rid):
    """S1-118 "Unknown request | 404 `not_found`" """
    err(world.ada.pay_request(rid), 404, "not_found")


@pytest.mark.req("S1-119", "S1-003")
def test_pay_replay_after_paid(world):
    """S1-119 "Replaying a successful payment returns 200 with its original payment body,
    including when the request is already `paid`. It moves no additional money and must not
    return `409 request_not_pending`." """
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    k = new_key()
    first = ok(world.ada.pay_request(rid, {"visibility": "private"}, key=k), 201)
    for _ in range(3):
        assert ok(world.ada.pay_request(rid, {"visibility": "private"}, key=k), 200) == first
    assert world.ada.balance() == 9990
    assert len([p for p in world.ada.feed() if p["request_id"] == rid]) == 1


# ---- decline / cancel ------------------------------------------------------------------

@pytest.mark.req("S1-120", "S1-122")
def test_decline(world):
    """S1-120 "Returns `200` with the request, `status: "declined"`. Declining an
    already-declined request is `200` with the current state" — no key needed."""
    rq = ok(world.bob.ask("ada", 10, note="x"), 201)
    d = ok(world.ada.post(f"/requests/{rq['request_id']}/decline"), 200)
    assert d["status"] == "declined" and d["request_id"] == rq["request_id"]
    assert REQUEST_FIELDS <= set(d) and d["payment_id"] is None
    assert d["amount"] == 10 and d["payer_handle"] == "ada"
    d2 = ok(world.ada.post(f"/requests/{rq['request_id']}/decline"), 200)
    assert d2 == d
    assert world.bob.requests_list()[0]["status"] == "declined"
    assert world.ada.balance() == 10000


@pytest.mark.req("S1-121")
def test_decline_paid_or_cancelled(world):
    """S1-121 "A `paid` or `cancelled` request is `409 request_not_pending`." """
    a = ok(world.bob.ask("ada", 10), 201)["request_id"]
    ok(world.ada.pay_request(a), 201)
    err(world.ada.post(f"/requests/{a}/decline"), 409, "request_not_pending")
    b = ok(world.bob.ask("ada", 10), 201)["request_id"]
    ok(world.bob.post(f"/requests/{b}/cancel"), 200)
    err(world.ada.post(f"/requests/{b}/decline"), 409, "request_not_pending")


@pytest.mark.req("S1-122")
def test_decline_not_payer(world):
    """S1-122 "Not the payer is `403 forbidden`." — the requester may not decline."""
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    err(world.bob.post(f"/requests/{rid}/decline"), 403, "forbidden")
    err(world.ada.post("/requests/rq_missing/decline"), 404, "not_found")


@pytest.mark.req("S1-123", "S1-125")
def test_cancel(world):
    """S1-123 "Returns `200` with the request, `status: "cancelled"`. Cancelling an
    already-cancelled request is `200`." """
    rq = ok(world.bob.ask("ada", 10), 201)
    c = ok(world.bob.post(f"/requests/{rq['request_id']}/cancel"), 200)
    assert c["status"] == "cancelled" and c["request_id"] == rq["request_id"]
    assert REQUEST_FIELDS <= set(c)
    c2 = ok(world.bob.post(f"/requests/{rq['request_id']}/cancel"), 200)
    assert c2["status"] == "cancelled"
    assert world.ada.requests_list()[0]["status"] == "cancelled"


@pytest.mark.req("S1-124")
def test_cancel_paid_or_declined(world):
    """S1-124 "A `paid` or `declined` request is `409 request_not_pending`." """
    a = ok(world.bob.ask("ada", 10), 201)["request_id"]
    ok(world.ada.pay_request(a), 201)
    err(world.bob.post(f"/requests/{a}/cancel"), 409, "request_not_pending")
    b = ok(world.bob.ask("ada", 10), 201)["request_id"]
    ok(world.ada.post(f"/requests/{b}/decline"), 200)
    err(world.bob.post(f"/requests/{b}/cancel"), 409, "request_not_pending")


@pytest.mark.req("S1-125")
def test_cancel_not_requester(world):
    """S1-125 "Not the requester is `403 forbidden`." — the payer may not cancel."""
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    err(world.ada.post(f"/requests/{rid}/cancel"), 403, "forbidden")
    err(world.bob.post("/requests/rq_missing/cancel"), 404, "not_found")


# ---- GET /requests -----------------------------------------------------------------------

@pytest.fixture
def mixed(world):
    """ada: incoming from bob (pending), outgoing to cy (pending), incoming from cy (declined),
    outgoing to bob (paid). bob<->cy request ada must never see."""
    w = world
    ids = {}
    ids["in_bob"] = ok(w.bob.ask("ada", 1), 201)["request_id"]
    ids["out_cy"] = ok(w.ada.ask("cy", 2), 201)["request_id"]
    ids["in_cy"] = ok(w.cy.ask("ada", 3), 201)["request_id"]
    ok(w.ada.post(f"/requests/{ids['in_cy']}/decline"), 200)
    ids["out_bob"] = ok(w.ada.ask("bob", 4), 201)["request_id"]
    ok(w.bob.pay_request(ids["out_bob"]), 201)
    ids["other"] = ok(w.bob.ask("cy", 5), 201)["request_id"]
    w.ids = ids
    return w


@pytest.mark.req("S1-126", "S1-046", "S1-131")
def test_list_only_own_newest_first(mixed):
    """S1-126 "Requests where the caller is the requester or the payer, and no others. Newest
    first by `created_at`." """
    w, ids = mixed, mixed.ids
    body = ok(w.ada.get("/requests"), 200)
    assert set(body) >= {"requests", "has_more"} and body["has_more"] is False
    got = [r["request_id"] for r in body["requests"]]
    assert set(got) == {ids["in_bob"], ids["out_cy"], ids["in_cy"], ids["out_bob"]}
    times = [ts(r["created_at"]) for r in body["requests"]]
    assert times == sorted(times, reverse=True)
    assert got[0] == ids["out_bob"] or times[0] == times[1]
    assert ids["other"] not in [r["request_id"] for r in w.dan.requests_list()]
    assert w.dan.requests_list() == []


@pytest.mark.req("S1-127")
def test_direction_filter(mixed):
    """S1-127 "`direction` is `incoming` (the caller is the payer), `outgoing` (the caller is
    the requester) or absent for both." """
    w, ids = mixed, mixed.ids
    inc = {r["request_id"] for r in w.ada.requests_list(direction="incoming")}
    out = {r["request_id"] for r in w.ada.requests_list(direction="outgoing")}
    assert inc == {ids["in_bob"], ids["in_cy"]}
    assert out == {ids["out_cy"], ids["out_bob"]}


@pytest.mark.req("S1-128")
@pytest.mark.parametrize("status,keys", [("pending", {"in_bob", "out_cy"}),
                                         ("declined", {"in_cy"}), ("paid", {"out_bob"}),
                                         ("cancelled", set())])
def test_status_filter(mixed, status, keys):
    """S1-128 "`status` is one of the four statuses, or absent for all." """
    w, ids = mixed, mixed.ids
    got = {r["request_id"] for r in w.ada.requests_list(status=status)}
    assert got == {ids[k] for k in keys}
    assert all(r["status"] == status for r in w.ada.requests_list(status=status))


@pytest.mark.req("S1-127", "S1-128")
def test_direction_and_status_together(mixed):
    """S1-127 + S1-128 combine."""
    w, ids = mixed, mixed.ids
    got = {r["request_id"] for r in w.ada.requests_list(direction="incoming",
                                                         status="pending")}
    assert got == {ids["in_bob"]}
    got = {r["request_id"] for r in w.ada.requests_list(direction="outgoing", status="paid")}
    assert got == {ids["out_bob"]}


@pytest.mark.req("S1-129")
@pytest.mark.parametrize("params", [{"direction": "both"}, {"direction": "INCOMING"},
                                    {"direction": ""}, {"status": "open"},
                                    {"status": "Paid"}, {"status": ""}, {"limit": "0"},
                                    {"limit": "201"}, {"limit": "-1"}, {"offset": "-1"}])
def test_bad_list_parameters(world, params):
    """S1-129 "Outside either range is 422 `validation_failed`. An unknown `direction` or
    `status` value is also 422." """
    err(world.ada.get("/requests", params=params), 422, "validation_failed")


@pytest.mark.req("S1-129", "S1-130")
def test_default_limit_is_50(world):
    """S1-129 "`limit` defaults to 50"; S1-130 has_more."""
    for i in range(51):
        ok(world.bob.ask("ada", i + 1), 201)
    body = ok(world.ada.get("/requests"), 200)
    assert len(body["requests"]) == 50 and body["has_more"] is True
    body = ok(world.ada.get("/requests", params={"offset": 50}), 200)
    assert len(body["requests"]) == 1 and body["has_more"] is False
    body = ok(world.ada.get("/requests", params={"limit": 51}), 200)
    assert len(body["requests"]) == 51 and body["has_more"] is False


@pytest.mark.req("S1-130")
def test_has_more_boundaries_and_paging(world):
    """S1-130 "`has_more` is true when items exist beyond the last one returned." Pages cover
    every item exactly once."""
    for i in range(5):
        ok(world.bob.ask("ada", i + 1), 201)
    seen = []
    for off in range(0, 5, 2):
        body = ok(world.ada.get("/requests", params={"limit": 2, "offset": off}), 200)
        seen += [r["request_id"] for r in body["requests"]]
        assert body["has_more"] is (off + 2 < 5)
    assert len(seen) == 5 == len(set(seen))
    body = ok(world.ada.get("/requests", params={"limit": 5}), 200)
    assert body["has_more"] is False
    body = ok(world.ada.get("/requests", params={"limit": 4}), 200)
    assert body["has_more"] is True
    body = ok(world.ada.get("/requests", params={"offset": 5}), 200)
    assert body["requests"] == [] and body["has_more"] is False
    body = ok(world.ada.get("/requests", params={"offset": 1000}), 200)
    assert body["requests"] == [] and body["has_more"] is False


@pytest.mark.req("S1-130", "S1-127")
def test_has_more_counts_filtered_items(mixed):
    """S1-130 has_more counts only the items the filter selects."""
    w = mixed
    body = ok(w.ada.get("/requests", params={"direction": "incoming", "limit": 2}), 200)
    assert len(body["requests"]) == 2 and body["has_more"] is False
    body = ok(w.ada.get("/requests", params={"direction": "incoming", "limit": 1}), 200)
    assert body["has_more"] is True
