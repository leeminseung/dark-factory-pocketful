"""Stage 1 §4 model: currency, amounts, handles, requests, visibility, fixture."""
import pytest

from conftest import (Api, conserve, err, err_any, fixture, new_key, ok, user,
                      seeded_total, PASSWORD)

MAX = 1_000_000_000
TWO53 = 2 ** 53


# ---- currency and amounts --------------------------------------------------

@pytest.mark.parametrize("currency,units", [("EUR", 2), ("JPY", 0), ("BHD", 3)])
@pytest.mark.req("S1-028", "S1-056")
def test_one_currency_from_the_fixture(make_world, currency, units):
    """S1-028 "The service has **one currency**, declared in the fixture."
    S1-056 "Fixtures use `EUR` (2), `JPY` (0) and `BHD` (3)." Every money response carries it."""
    w = make_world(fixture(currency=currency))
    me = w.ada.me()
    assert me["currency"] == currency and me["minor_units"] == units
    assert ok(w.ada.pay("bob", 10), 201)["currency"] == currency
    assert ok(w.bob.ask("ada", 10), 201)["currency"] == currency
    sp = ok(w.ada.split(10, ["ada", "bob"]), 201)
    assert sp["currency"] == currency and sp["requests"][0]["currency"] == currency


@pytest.mark.parametrize("raw", ["1000", "1000.0", "1e3", "1E3", "1.0e3", "10000e-1"])
@pytest.mark.req("S1-029", "S1-004")
def test_integral_number_forms_are_the_same_amount(world, raw):
    """S1-029 "JSON `1000`, `1000.0` and `1e3` all represent the same valid minor-unit
    amount." The payment moves exactly 1000 and reports the integer 1000."""
    body = ('{"to_handle": "bob", "amount": %s}' % raw).encode()
    r = world.ada.request("POST", "/payments", content=body, key=new_key())
    p = ok(r, 201)
    assert p["amount"] == 1000 and isinstance(p["amount"], int)
    assert world.ada.balance() == 9000
    assert world.bob.balance() == 3500


@pytest.mark.parametrize("raw", ["1e9", "1000000000.0", "1E+9"])
@pytest.mark.req("S1-029", "S1-050")
def test_integral_forms_at_the_maximum_are_valid(world, raw):
    """S1-029 integral forms; S1-050 "at most `1000000000`": in range, so the outcome is a
    funds error, not a validation error."""
    body = ('{"to_handle": "bob", "amount": %s}' % raw).encode()
    err(world.ada.request("POST", "/payments", content=body, key=new_key()),
        409, "insufficient_funds")


@pytest.mark.parametrize("raw", ["true", "false", '"1000"', '"1e3"', "null", "[1000]",
                                 '{"v": 1000}', "1000.5", "1e-3", "1e400", "-1e400"])
@pytest.mark.req("S1-030", "S1-067")
def test_non_numbers_and_non_integral_amounts_are_422(world, raw):
    """S1-030 "Booleans and strings are not numbers here." S1-067 "invalid `amount` values
    (including strings and booleans) ... are 422 `validation_failed`"."""
    body = ('{"to_handle": "bob", "amount": %s}' % raw).encode()
    err(world.ada.request("POST", "/payments", content=body, key=new_key()),
        422, "validation_failed")
    assert world.ada.balance() == 10000


@pytest.mark.parametrize("amount", [MAX + 1, TWO53 - 1, TWO53 + 1, 10 ** 30])
@pytest.mark.req("S1-050", "S1-051")
def test_amounts_above_the_maximum_are_refused_exactly(world, amount):
    """S1-050 "`amount` is at most `1000000000` on any single request" — including values a
    double cannot hold exactly."""
    err(world.ada.pay("bob", amount), 422, "validation_failed")
    err(world.bob.ask("ada", amount), 422, "validation_failed")
    err(world.ada.split(amount, ["ada", "bob"]), 422, "validation_failed")


@pytest.mark.req("S1-051", "S1-004")
def test_balances_near_two_to_the_53_stay_exact(make_world):
    """S1-051 "no operation produces a balance outside ±2⁵³. Monetary arithmetic must
    preserve exact minor-unit values without rounding error." """
    big = TWO53 - 2 * MAX
    w = make_world(fixture(users=[user("ada", big), user("bob", MAX - 7)]))
    assert w.ada.balance() == big
    ok(w.ada.pay("bob", MAX), 201)
    ok(w.ada.pay("bob", 1), 201)
    assert w.ada.balance() == big - MAX - 1
    assert w.bob.balance() == 2 * MAX - 6
    ok(w.bob.pay("ada", 999_999_999), 201)
    assert w.ada.balance() == big - 2
    assert w.bob.balance() == MAX - 5


@pytest.mark.req("S1-005", "S1-103")
def test_money_moves_only_between_existing_wallets(world):
    """S1-005 "Money moves only between existing wallets." """
    err(world.ada.pay("ghost", 10), 404, "not_found")
    conserve(world)


# ---- handles -----------------------------------------------------------------

@pytest.mark.req("S1-031", "S1-033", "S1-095")
def test_seeded_handles_are_reported(world):
    """S1-033 "Seeded users take their handle from the fixture." """
    for h, c in world.clients.items():
        assert c.me()["handle"] == h


@pytest.mark.req("S1-031", "S1-055", "S1-065")
@pytest.mark.parametrize("bad", ["ADA", "a-b", "", "a" * 21, "ada!"])
def test_fixture_handle_outside_the_pattern_is_a_reset_error(world, reset, bad):
    """S1-031 handles match `^[a-z0-9_]{1,20}$` (decision D3: a fixture that breaks it is
    422 `validation_failed` and changes nothing)."""
    fx = fixture(users=[user("ada", 10), user("bob", 1)])
    fx["users"][1]["handle"] = bad
    err(reset(fx, expect=None), 422, "validation_failed")
    assert world.ada.balance() == 10000, "previous state unchanged"


@pytest.mark.req("S1-031", "S1-065")
def test_fixture_with_duplicate_handles_is_a_reset_error(world, reset):
    """S1-031 handles are "unique across the service" (decision D3)."""
    fx = fixture(users=[user("ada", 10), user("bob", 1)])
    fx["users"][1]["handle"] = "ada"
    err(reset(fx, expect=None), 422, "validation_failed")
    assert world.ada.balance() == 10000


@pytest.mark.req("S1-031", "S1-032")
def test_handle_never_changes(world):
    """S1-031 "never changing once set": an unknown `handle` field on a write is ignored."""
    world.ada.post("/auth/signup", {"email": "q@example.com", "password": PASSWORD,
                                    "display_name": "Q", "handle": "zzz"}, token=None)
    assert world.ada.me()["handle"] == "ada"
    c = Api(world.ada.base_url)
    c.token = ok(c.login("q@example.com"), 200)["token"]
    assert c.me()["handle"] == "q"
    c.close()


@pytest.mark.parametrize("email,handle", [
    ("Dee.Ann+tag@example.com", "dee_ann_tag"),
    ("UPPER@example.com", "upper"),
    ("a" * 30 + "@example.com", "a" * 20),
    ("Zoë@example.com", "zo_"),
    ("a😀b@example.com", "a_b"),
    ("José.Ñ@example.com", "jos___"),
    ("x-y.z@example.com", "x_y_z"),
    ("é" * 25 + "@example.com", "_" * 20),
    ("abcdefghij.klmnopqrstuvwxyz@example.com", "abcdefghij_klmnopqrs"),
    ("007@example.com", "007"),
])
@pytest.mark.req("S1-034", "S1-031")
def test_handle_is_derived_per_character(world, api, email, handle):
    """S1-034 "take the local part, lowercase it, replace every character outside
    `[a-z0-9_]` with `_`, and truncate to 20 characters." (decision D5: per code point)"""
    tok = ok(world.ada.signup(email), 201)["token"]
    assert api(tok).me()["handle"] == handle


@pytest.mark.req("S1-035", "S1-080")
def test_two_emails_deriving_one_handle(world, api):
    """S1-035 "If that handle is already taken the signup fails" — `a.b` and `a_b` and `A-B`
    all derive `a_b`."""
    ok(world.ada.signup("a.b@example.com"), 201)
    err(world.ada.signup("a_b@other.example"), 409, "handle_taken")
    err(world.ada.signup("A-B@third.example"), 409, "handle_taken")
    err(api().login("a_b@other.example"), 401, "unauthenticated")
    err(api().login("A-B@third.example"), 401, "unauthenticated")


@pytest.mark.req("S1-036")
def test_new_user_starts_at_zero_and_can_receive_and_be_asked(world, api):
    """S1-036 "New users start with a balance of `0`. They can receive money and be asked
    for money immediately." """
    tok = ok(world.ada.signup("newbie@example.com"), 201)["token"]
    nb = api(tok)
    assert nb.balance() == 0
    ok(world.ada.pay("newbie", 42), 201)
    assert nb.balance() == 42
    rq = ok(world.bob.ask("newbie", 1000), 201)
    assert rq["status"] == "pending" and rq["payer_handle"] == "newbie"
    err(nb.pay_request(rq["request_id"]), 409, "insufficient_funds")


# ---- payments and requests (model) --------------------------------------------

@pytest.mark.req("S1-037", "S1-104")
def test_payment_moves_money_immediately(world):
    """S1-037 "A **payment** moves money from one wallet to another, immediately and
    atomically." Both wallets and both feeds show it right after the 201."""
    p = ok(world.ada.pay("bob", 1234), 201)
    assert world.ada.balance() == 10000 - 1234
    assert world.bob.balance() == 2500 + 1234
    assert p["payment_id"] in [x["payment_id"] for x in world.ada.feed()]
    assert p["payment_id"] in [x["payment_id"] for x in world.bob.feed()]


@pytest.mark.req("S1-038")
def test_request_status_moves_once_from_pending(world):
    """S1-038 "A request is `pending`, and then exactly one of `paid`, `declined` or
    `cancelled`." No terminal status can change into another."""
    a = ok(world.bob.ask("ada", 10), 201)["request_id"]
    b = ok(world.bob.ask("ada", 10), 201)["request_id"]
    c = ok(world.bob.ask("ada", 10), 201)["request_id"]
    ok(world.ada.pay_request(a), 201)
    ok(world.ada.post(f"/requests/{b}/decline"), 200)
    ok(world.bob.post(f"/requests/{c}/cancel"), 200)
    for rid in (a, b, c):
        err(world.ada.pay_request(rid), 409, "request_not_pending")
    err(world.ada.post(f"/requests/{a}/decline"), 409, "request_not_pending")
    err(world.ada.post(f"/requests/{c}/decline"), 409, "request_not_pending")
    err(world.bob.post(f"/requests/{a}/cancel"), 409, "request_not_pending")
    err(world.bob.post(f"/requests/{b}/cancel"), 409, "request_not_pending")
    status = {r["request_id"]: r["status"] for r in world.ada.requests_list()}
    assert status == {a: "paid", b: "declined", c: "cancelled"}


@pytest.mark.req("S1-039", "S1-062", "S1-117", "S1-122", "S1-125")
def test_only_payer_pays_or_declines_only_requester_cancels(world):
    """S1-039 "Only the payer may pay or decline it; only the requester may cancel it." """
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    err(world.bob.pay_request(rid), 403, "forbidden")
    err(world.bob.post(f"/requests/{rid}/decline"), 403, "forbidden")
    err(world.ada.post(f"/requests/{rid}/cancel"), 403, "forbidden")
    for c in (world.cy, world.dan):
        err_any(c.pay_request(rid), {(403, "forbidden"), (404, "not_found")})
        err_any(c.post(f"/requests/{rid}/decline"), {(403, "forbidden"), (404, "not_found")})
        err_any(c.post(f"/requests/{rid}/cancel"), {(403, "forbidden"), (404, "not_found")})
    assert world.bob.requests_list()[0]["status"] == "pending"
    conserve(world)


@pytest.mark.req("S1-040", "S1-111")
def test_request_above_payer_balance_is_created(world):
    """S1-040 "**A request may exceed the payer's balance.** That is a legal state, not an
    error at creation time" — up to the maximum amount, from a payer holding 0."""
    r = ok(world.bob.ask("dan", MAX), 201)
    assert r["status"] == "pending" and r["amount"] == MAX


@pytest.mark.req("S1-041", "S1-116")
def test_short_payer_gets_409_then_pays_once_funded(world):
    """S1-041 "an attempt to pay it while short is `409 insufficient_funds` and changes
    nothing. Money can arrive later and the same request then becomes payable." """
    rid = ok(world.bob.ask("dan", 300), 201)["request_id"]
    err(world.dan.pay_request(rid), 409, "insufficient_funds")
    assert world.dan.balance() == 0 and world.bob.balance() == 2500
    assert world.dan.requests_list()[0]["status"] == "pending"
    assert world.dan.feed() == []
    ok(world.ada.pay("dan", 299), 201)
    err(world.dan.pay_request(rid), 409, "insufficient_funds")
    ok(world.ada.pay("dan", 1), 201)
    p = ok(world.dan.pay_request(rid), 201)
    assert p["amount"] == 300 and world.dan.balance() == 0
    conserve(world)


@pytest.mark.req("S1-042", "S1-112")
def test_payer_chooses_visibility_when_money_moves(world):
    """S1-042 "**Visibility belongs to the payment, not the request.** The payer chooses it
    when the money moves." A `visibility` sent by the requester at creation has no effect."""
    rid = ok(world.bob.ask("ada", 10, visibility="private"), 201)["request_id"]
    p = ok(world.ada.pay_request(rid), 201)
    assert p["visibility"] == "public"
    assert p["payment_id"] in [x["payment_id"] for x in world.cy.feed()]
    rid2 = ok(world.bob.ask("ada", 10, visibility="public"), 201)["request_id"]
    p2 = ok(world.ada.pay_request(rid2, {"visibility": "private"}), 201)
    assert p2["visibility"] == "private"
    assert p2["payment_id"] not in [x["payment_id"] for x in world.cy.feed()]


@pytest.mark.req("S1-043")
def test_request_has_no_visibility_and_is_never_in_a_feed(world):
    """S1-043 "A request carries no visibility of its own and never appears in anyone else's
    feed." """
    r = ok(world.bob.ask("ada", 10), 201)
    assert "visibility" not in r
    for c in world.clients.values():
        assert c.feed() == []


# ---- fixture -----------------------------------------------------------------

SEED = {
    "currency": "EUR", "minor_units": 2,
    "users": [
        {"id": "u_ada", "email": "ada@example.com", "password": "correct horse",
         "display_name": "Ada", "handle": "ada", "balance": 10000},
        {"id": "u_bob", "email": "bob@example.com", "password": "correct horse",
         "display_name": "Bob", "handle": "bob", "balance": 2500},
        {"id": "u_cy", "email": "cy@example.com", "password": "another pass 9",
         "display_name": "Cy", "handle": "cy", "balance": 0},
    ],
    "payments": [
        {"id": "p_1", "from_user_id": "u_ada", "to_user_id": "u_bob",
         "amount": 500, "note": "coffee", "visibility": "public"},
        {"id": "p_2", "from_user_id": "u_bob", "to_user_id": "u_ada",
         "amount": 70, "note": "secret", "visibility": "private"},
    ],
    "requests": [
        {"id": "rq_1", "requester_id": "u_bob", "payer_id": "u_ada",
         "amount": 1200, "note": "taxi", "status": "pending"},
        {"id": "rq_2", "requester_id": "u_ada", "payer_id": "u_cy",
         "amount": 5, "note": "old", "status": "cancelled"},
    ],
}


@pytest.fixture
def seeded(api, reset):
    reset(SEED)
    out = {}
    for u in SEED["users"]:
        c = api()
        c.token = ok(c.login(u["email"], u["password"]), 200)["token"]
        out[u["handle"]] = c
    return out


@pytest.mark.req("S1-052", "S1-053", "S1-095")
def test_fixture_users_log_in_and_see_their_profile(seeded):
    """S1-052 the fixture format; S1-053 "Seeded users must be able to log in with the given
    password immediately." """
    me = seeded["ada"].me()
    assert me["display_name"] == "Ada" and me["handle"] == "ada"
    assert seeded["cy"].me()["display_name"] == "Cy"


@pytest.mark.req("S1-053", "S1-079")
def test_seeded_password_is_the_one_given(seeded, api):
    """S1-053 log in "with the given password": another user's password does not work."""
    err(api().login("cy@example.com", "correct horse"), 401, "unauthenticated")


@pytest.mark.req("S1-054")
def test_seeded_balances_are_not_replayed(seeded):
    """S1-054 "`balance` is the wallet balance **after** every seeded payment has been applied
    ... you do not replay seeded payments against balances." """
    assert seeded["ada"].balance() == 10000
    assert seeded["bob"].balance() == 2500
    assert seeded["cy"].balance() == 0


@pytest.mark.req("S1-057", "S1-052")
def test_seeded_ids_are_the_api_ids(seeded):
    """S1-057 decision D4: the `GET /me` example shows `"user_id": "u_ada"` for fixture user
    `u_ada`; seeded payment and request ids are kept."""
    assert seeded["ada"].me()["user_id"] == "u_ada"
    feed = seeded["ada"].feed()
    assert {p["payment_id"] for p in feed} == {"p_1", "p_2"}
    p1 = next(p for p in feed if p["payment_id"] == "p_1")
    assert (p1["from_user_id"], p1["to_user_id"], p1["from_handle"], p1["to_handle"],
            p1["amount"], p1["note"], p1["visibility"], p1["request_id"]) == \
        ("u_ada", "u_bob", "ada", "bob", 500, "coffee", "public", None)
    rqs = {r["request_id"]: r for r in seeded["ada"].requests_list()}
    assert set(rqs) == {"rq_1", "rq_2"}
    assert rqs["rq_1"]["requester_id"] == "u_bob" and rqs["rq_1"]["payer_handle"] == "ada"
    assert rqs["rq_1"]["status"] == "pending" and rqs["rq_1"]["payment_id"] is None
    assert rqs["rq_2"]["status"] == "cancelled"


@pytest.mark.req("S1-052", "S1-044", "S1-049")
def test_seeded_payments_follow_the_feed_rule(seeded):
    """S1-052/S1-044: seeded private p_2 (bob->ada) is hidden from cy, public p_1 is not."""
    assert [p["payment_id"] for p in seeded["cy"].feed()] == ["p_1"]
    assert {p["payment_id"] for p in seeded["bob"].feed()} == {"p_1", "p_2"}


@pytest.mark.req("S1-052", "S1-041")
def test_seeded_pending_request_is_payable_and_cancelled_is_not(seeded):
    """S1-052 seeded requests are live: rq_1 can be paid; rq_2 is cancelled."""
    p = ok(seeded["ada"].pay_request("rq_1"), 201)
    assert p["request_id"] == "rq_1" and p["amount"] == 1200
    assert seeded["ada"].balance() == 8800 and seeded["bob"].balance() == 3700
    err(seeded["cy"].pay_request("rq_2"), 409, "request_not_pending")


@pytest.mark.req("S1-025", "S1-052")
def test_fixture_fields_outside_the_format_are_ignored(api, reset):
    """S1-025 unknown fields are ignored: a fixture carrying extra fields still loads."""
    fx = fixture(users=[user("ada", 100, role="admin", created_at="garbage"),
                        user("bob", 0)])
    fx["payments"] = [{"id": "p_x", "from_user_id": "u_ada", "to_user_id": "u_bob",
                       "amount": 1, "note": "", "visibility": "public",
                       "created_at": "not-a-time", "colour": 1}]
    fx["extra_top_level"] = {"a": 1}
    reset(fx)
    c = api()
    c.token = ok(c.login("ada@example.com"), 200)["token"]
    assert c.balance() == 100
    assert len(c.feed()) == 1


@pytest.mark.req("S1-055")
@pytest.mark.parametrize("bad", [-1, -(2 ** 53)])
def test_negative_seeded_balance_is_a_reset_error_and_changes_nothing(world, reset, api, bad):
    """S1-055 "A `balance` below zero in a fixture is a reset error: return `422
    validation_failed` from `POST /_test/reset` and change nothing." """
    ok(world.ada.pay("bob", 10), 201)
    fx = fixture(users=[user("ada", 5), user("bob", bad), user("newcomer", 7)])
    err(reset(fx, expect=None), 422, "validation_failed")
    assert world.ada.balance() == 9990
    assert len(world.ada.feed()) == 1
    err(api().login("newcomer@example.com"), 401, "unauthenticated")
    ok(world.ada.get("/me"), 200)


@pytest.mark.req("S1-056", "S1-065")
@pytest.mark.parametrize("units", [1, 4, -1])
def test_minor_units_outside_0_2_3_is_a_reset_error(world, reset, units):
    """S1-056 "`minor_units` is `0`, `2` or `3`." (decision D3)"""
    err(reset(fixture(minor_units=units), expect=None), 422, "validation_failed")
    assert world.ada.me()["minor_units"] == 2


@pytest.mark.req("S1-001", "S1-021")
def test_seeded_total_is_the_last_reset(make_world):
    """S1-001 "equals the total seeded by the last `POST /_test/reset`" after a second reset."""
    make_world(fixture())
    w = make_world(fixture(users=[user("ada", 1), user("bob", 2), user("cy", 3)]))
    ok(w.cy.pay("ada", 3), 201)
    assert w.total() == 6 == seeded_total(w.fixture)
