"""Stage 1 §11 atomic net settlements."""
import pytest

from conftest import (assert_id, assert_timestamp, conserve, err, err_any, fixture,
                      new_key, ok, user)

MAX = 1_000_000_000


def t(f, to, amount, **kw):
    return {"from_handle": f, "to_handle": to, "amount": amount, **kw}


def snapshot(w):
    return ({h: c.balance() for h, c in w.clients.items()},
            sorted(x["payment_id"] for x in w.ada.feed()))


@pytest.fixture
def ops(make_world):
    """ada operator with 100; bob 0; cy 50; dan 1000 (not an operator)."""
    return make_world(fixture(users=[user("ada", 100), user("bob", 0), user("cy", 50),
                                     user("dan", 1000)], operators=["u_ada"]))


@pytest.mark.req("S1-167", "S1-170")
def test_operator_list_defaults_to_empty(world):
    """S1-167 "`settlement_operator_ids`, an array of user ids, default []." — with no list,
    nobody may settle."""
    for c in world.clients.values():
        err(c.settle([t("ada", "bob", 1)]), 403, "forbidden")
    conserve(world)


@pytest.mark.req("S1-167")
def test_several_operators(make_world):
    """S1-167 an array of user ids: every listed user is an operator."""
    w = make_world(fixture(operators=["u_bob", "u_cy"]))
    ok(w.bob.settle([t("ada", "dan", 1)]), 201)
    ok(w.cy.settle([t("ada", "dan", 1)]), 201)
    err(w.ada.settle([t("ada", "dan", 1)]), 403, "forbidden")


@pytest.mark.req("S1-168")
def test_operator_moves_money_between_other_wallets(ops):
    """S1-168 "An operator may execute a settlement across any wallets." — the operator is
    party to none of the transfers."""
    s = ok(ops.ada.settle([t("dan", "bob", 300), t("cy", "dan", 50)]), 201)
    assert ops.dan.balance() == 750 and ops.bob.balance() == 300 and ops.cy.balance() == 0
    assert ops.ada.balance() == 100
    assert [(p["from_handle"], p["to_handle"], p["amount"]) for p in s["payments"]] == \
        [("dan", "bob", 300), ("cy", "dan", 50)]
    conserve(ops)


@pytest.mark.req("S1-169")
def test_operator_gets_no_access_to_others_requests_or_private_items(ops):
    """S1-169 "This permission does not grant access to another user's requests or private
    activity items." """
    rid = ok(ops.dan.ask("cy", 10), 201)["request_id"]
    assert ops.ada.requests_list() == []
    err_any(ops.ada.pay_request(rid), {(403, "forbidden"), (404, "not_found")})
    err_any(ops.ada.post(f"/requests/{rid}/decline"), {(403, "forbidden"),
                                                      (404, "not_found")})
    err_any(ops.ada.post(f"/requests/{rid}/cancel"), {(403, "forbidden"),
                                                     (404, "not_found")})
    p = ok(ops.dan.pay("bob", 5, visibility="private"), 201)
    s = ok(ops.ada.settle([t("dan", "cy", 5, visibility="private")]), 201)
    seen = [x["payment_id"] for x in ops.ada.feed()]
    assert p["payment_id"] not in seen
    assert s["payments"][0]["payment_id"] not in seen
    assert ops.cy.requests_list()[0]["status"] == "pending"


@pytest.mark.req("S1-170")
def test_no_token_401_non_operator_403(ops):
    """S1-170 "No token gives 401; authenticated non-operator gives 403 `forbidden`." """
    err(ops.ada.request("POST", "/settlements", json_body={"transfers": [t("dan", "bob", 1)]},
                        key=new_key(), token=None), 401, "unauthenticated")
    err(ops.dan.settle([t("dan", "bob", 1)]), 403, "forbidden")
    err(ops.bob.settle([t("dan", "bob", 1)]), 403, "forbidden")
    assert ops.dan.balance() == 1000 and ops.bob.balance() == 0


@pytest.mark.req("S1-170", "S1-084", "S1-060")
def test_operator_needs_a_key(ops):
    """S1-170 "requires an operator and an idempotency key" """
    before = snapshot(ops)
    err(ops.ada.post("/settlements", {"transfers": [t("dan", "bob", 1)]}), 400,
        "missing_idempotency_key")
    assert snapshot(ops) == before


@pytest.mark.req("S1-171")
def test_one_and_thirty_two_transfers(ops):
    """S1-171 "transfers contains 1..32 objects." """
    ok(ops.ada.settle([t("dan", "bob", 1)]), 201)
    s = ok(ops.ada.settle([t("dan", "bob", i + 1) for i in range(32)]), 201)
    assert len(s["payments"]) == 32
    assert [p["amount"] for p in s["payments"]] == list(range(1, 33))
    assert ops.bob.balance() == 1 + 32 * 33 // 2


@pytest.mark.req("S1-171", "S1-175")
@pytest.mark.parametrize("transfers", ["zero", "33", "string", "object", "null", "number",
                                       "entry_string", "entry_list", "entry_null"])
def test_malformed_batch_shape(ops, transfers):
    """S1-175 "malformed batch shape is 422 `validation_failed`." — 0 or 33 transfers,
    `transfers` not an array, an entry not an object."""
    body = {"zero": [], "33": [t("dan", "bob", 1)] * 33, "string": "dan->bob",
            "object": t("dan", "bob", 1), "null": None, "number": 1,
            "entry_string": ["dan->bob"], "entry_list": [["dan", "bob", 1]],
            "entry_null": [None]}[transfers]
    before = snapshot(ops)
    err(ops.ada.post("/settlements", {"transfers": body}, key=new_key()), 422,
        "validation_failed")
    assert snapshot(ops) == before


@pytest.mark.req("S1-175", "S1-065")
def test_missing_transfers(ops):
    """S1-175 / S1-065: a body without `transfers` is 422."""
    err(ops.ada.post("/settlements", {}, key=new_key()), 422, "validation_failed")


@pytest.mark.req("S1-172", "S1-099")
@pytest.mark.parametrize("amount", [0, -1, MAX + 1, 1.5, "5", True, None])
def test_entry_amount_rules(ops, amount):
    """S1-172 "Each uses ordinary payment amount ... rules" """
    err(ops.ada.settle([t("dan", "bob", 1), t("dan", "bob", amount)]), 422,
        "validation_failed")
    assert ops.bob.balance() == 0


@pytest.mark.req("S1-172", "S1-065")
@pytest.mark.parametrize("missing", ["from_handle", "to_handle", "amount"])
def test_entry_missing_field(ops, missing):
    """S1-172 / S1-065 a required entry field missing is 422."""
    e = t("dan", "bob", 1)
    del e[missing]
    err_any(ops.ada.settle([e]), {(422, "validation_failed")})


@pytest.mark.req("S1-172", "S1-101", "S1-102", "S1-067")
@pytest.mark.parametrize("extra", [{"note": "x" * 201}, {"note": None}, {"note": 5},
                                   {"visibility": "secret"}, {"visibility": None}])
def test_entry_note_and_visibility_rules(ops, extra):
    """S1-172 "Each uses ordinary payment ... note and visibility rules" """
    err(ops.ada.settle([t("dan", "bob", 1, **extra)]), 422, "validation_failed")


@pytest.mark.req("S1-172", "S1-097")
def test_entry_defaults(ops):
    """S1-172 "(defaults: empty note, public)" and explicit values kept verbatim."""
    s = ok(ops.ada.settle([t("dan", "bob", 1),
                           t("dan", "cy", 2, note="  😀 x ", visibility="private"),
                           t("dan", "bob", 3, note="😀" * 200)]), 201)
    a, b, c = s["payments"]
    assert a["note"] == "" and a["visibility"] == "public"
    assert b["note"] == "  😀 x " and b["visibility"] == "private"
    assert c["note"] == "😀" * 200


@pytest.mark.req("S1-173")
def test_unknown_handle(ops):
    """S1-173 "Unknown handle is 404" — as sender or receiver."""
    err(ops.ada.settle([t("dan", "bob", 1), t("ghost", "bob", 1)]), 404, "not_found")
    err(ops.ada.settle([t("dan", "ghost", 1)]), 404, "not_found")
    assert ops.bob.balance() == 0 and ops.dan.balance() == 1000


@pytest.mark.req("S1-174")
def test_self_transfer(ops):
    """S1-174 "self-transfer is 422 `self_payment`" — for any wallet, operator included."""
    err(ops.ada.settle([t("dan", "dan", 1)]), 422, "self_payment")
    err(ops.ada.settle([t("dan", "bob", 1), t("ada", "ada", 1)]), 422, "self_payment")
    assert ops.bob.balance() == 0


@pytest.mark.req("S1-176")
@pytest.mark.parametrize("entries,status,code", [
    ([("ghost", "bob", 1), ("dan", "dan", 1)], 404, "not_found"),
    ([("dan", "dan", 1), ("ghost", "bob", 1)], 422, "self_payment"),
    ([("dan", "bob", 0), ("ghost", "bob", 1)], 422, "validation_failed"),
    ([("ghost", "bob", 1), ("dan", "bob", 0)], 404, "not_found"),
    ([("dan", "dan", 1), ("dan", "bob", -1)], 422, "self_payment"),
    ([("bob", "cy", 999), ("ghost", "bob", 1)], 404, "not_found"),
    ([("bob", "cy", 999), ("cy", "cy", 1)], 422, "self_payment"),
    ([("bob", "cy", 999), ("cy", "bob", MAX + 1)], 422, "validation_failed"),
])
def test_entry_errors_in_input_order_before_funds(ops, entries, status, code):
    """S1-176 "Entry errors take precedence in input order, before insufficient funds." bob
    holds 0, so `bob -> cy 999` alone would be 409."""
    transfers = [t(*e) for e in entries]
    err(ops.ada.settle(transfers), status, code)


@pytest.mark.req("S1-177", "S1-025")
def test_unknown_fields_ignored(ops):
    """S1-177 "Unknown fields are ignored." — top level and in entries."""
    s = ok(ops.ada.post("/settlements", {"transfers": [t("dan", "bob", 1, colour="x",
                                                         settlement_id="forged")],
                                         "dry_run": True, "id": "x"}, key=new_key()), 201)
    assert s["settlement_id"] != "forged"
    assert ops.bob.balance() == 1


@pytest.mark.req("S1-178")
def test_affordable_by_net_position(ops):
    """S1-178 "A settlement is affordable when every wallet's balance after all incoming and
    outgoing transfers is nonnegative." bob holds 0 but receives before (and after) he
    sends; a ring through empty wallets."""
    ok(ops.ada.settle([t("bob", "cy", 40), t("dan", "bob", 40)]), 201)
    assert ops.bob.balance() == 0 and ops.cy.balance() == 90 and ops.dan.balance() == 960
    ok(ops.ada.settle([t("bob", "ada", 500), t("ada", "cy", 500), t("cy", "bob", 500)]), 201)
    assert (ops.ada.balance(), ops.bob.balance(), ops.cy.balance()) == (100, 0, 90)
    ok(ops.ada.settle([t("cy", "bob", 90), t("bob", "dan", 90)]), 201)
    assert ops.cy.balance() == 0 and ops.bob.balance() == 0
    conserve(ops)


@pytest.mark.req("S1-179", "S1-180")
def test_collective_shortfall_is_409_and_moves_nothing(ops):
    """S1-179 "Insufficient collective funds gives 409 `insufficient_funds`." S1-180 "Either
    all movements commit together or none do" — bob would end at -1."""
    before = snapshot(ops)
    err(ops.ada.settle([t("dan", "bob", 40), t("bob", "cy", 41)]), 409, "insufficient_funds")
    err(ops.ada.settle([t("dan", "bob", 1)] * 31 + [t("cy", "dan", 51)]), 409,
        "insufficient_funds")
    assert snapshot(ops) == before


@pytest.mark.req("S1-180", "S1-090")
def test_failed_settlement_claims_no_key(ops):
    """S1-180 "failed validation claims no idempotency key and creates no payment or
    revision." The same key then succeeds with a valid body, then replays."""
    key = new_key()
    before = snapshot(ops)
    err(ops.ada.settle([t("ghost", "bob", 1)], key=key), 404, "not_found")
    err(ops.ada.settle([t("bob", "cy", 1)], key=key), 409, "insufficient_funds")
    err(ops.ada.settle([], key=key), 422, "validation_failed")
    assert snapshot(ops) == before
    s = ok(ops.ada.settle([t("dan", "bob", 5)], key=key), 201)
    assert ok(ops.ada.settle([t("dan", "bob", 5)], key=key), 200) == s


@pytest.mark.req("S1-181", "S1-183", "S1-184")
def test_response_shape(ops):
    """S1-181 "Return 201 with `settlement_id`, `committed_at` and `payments` in input order."
    S1-183 "Members have null request_id and the same server-assigned created_at, equal to
    committed_at." S1-184 "The settlement response contains every member's receipt." """
    tr = [t("dan", "bob", 7, note="a"), t("dan", "cy", 8, visibility="private"),
          t("cy", "ada", 9), t("dan", "bob", 1)]
    s = ok(ops.ada.settle(tr), 201)
    assert_id(s["settlement_id"])
    assert_timestamp(s["committed_at"])
    assert len(s["payments"]) == 4
    for e, p in zip(tr, s["payments"]):
        assert (p["from_handle"], p["to_handle"], p["amount"]) == \
            (e["from_handle"], e["to_handle"], e["amount"])
        assert p["request_id"] is None
        assert p["created_at"] == s["committed_at"]
        assert p["settlement_id"] == s["settlement_id"]
        assert p["currency"] == "EUR"
        assert_id(p["payment_id"])
        assert p["from_user_id"] == "u_" + e["from_handle"]
    assert len({p["payment_id"] for p in s["payments"]}) == 4


@pytest.mark.req("S1-182")
def test_members_are_ordinary_payments(ops):
    """S1-182 "Every member is an ordinary payment with `settlement_id` linking the batch;
    nonmembers expose null for that field." The feed shows the same receipts."""
    direct = ok(ops.dan.pay("cy", 1), 201)
    s = ok(ops.ada.settle([t("dan", "bob", 2), t("dan", "cy", 3)]), 201)
    feed = {x["payment_id"]: x for x in ops.dan.feed()}
    for p in s["payments"]:
        assert feed[p["payment_id"]] == p
    assert feed[direct["payment_id"]]["settlement_id"] is None
    s2 = ok(ops.ada.settle([t("dan", "bob", 1)]), 201)
    assert s2["settlement_id"] != s["settlement_id"]


@pytest.mark.req("S1-184", "S1-044")
def test_members_follow_feed_visibility(ops):
    """S1-184 "Constituents follow ordinary activity-feed visibility." """
    s = ok(ops.ada.settle([t("dan", "bob", 2, visibility="private"), t("dan", "cy", 3)]),
           201)
    priv, pub = s["payments"]
    for h, c in ops.clients.items():
        seen = {x["payment_id"] for x in c.feed()}
        assert pub["payment_id"] in seen
        assert (priv["payment_id"] in seen) == (h in ("dan", "bob")), h


@pytest.mark.req("S1-185", "S1-088", "S1-093")
def test_replay_returns_the_original_complete_response(ops):
    """S1-185 "Replays return 200 with the original complete response." — also after the
    balances changed so the batch would no longer be affordable."""
    key = new_key()
    tr = [t("cy", "bob", 50)]
    s = ok(ops.ada.settle(tr, key=key), 201)
    assert ops.cy.balance() == 0
    assert ok(ops.ada.settle(tr, key=key), 200) == s
    assert ops.cy.balance() == 0 and ops.bob.balance() == 50
    err(ops.ada.settle([t("cy", "bob", 51)], key=key), 409, "idempotency_key_reuse")


@pytest.mark.req("S1-185", "S1-085")
def test_settlement_keys_are_per_operator(make_world):
    """S1-085 keys are scoped per user: two operators, same key, same body: two settlements."""
    w = make_world(fixture(operators=["u_ada", "u_bob"]))
    key = new_key()
    a = ok(w.ada.settle([t("cy", "dan", 1)], key=key), 201)
    b = ok(w.bob.settle([t("cy", "dan", 1)], key=key), 201)
    assert a["settlement_id"] != b["settlement_id"]
    assert w.dan.balance() == 2


@pytest.mark.req("S1-186", "S1-167")
def test_reset_sets_operator_permissions(make_world):
    """S1-186 "A reset ... must preserve settlement operator permissions": the operator list
    is the last fixture's."""
    w = make_world(fixture(operators=["u_ada"]))
    ok(w.ada.settle([t("ada", "bob", 1)]), 201)
    w2 = make_world(fixture(operators=["u_bob"]))
    err(w2.ada.settle([t("ada", "bob", 1)]), 403, "forbidden")
    ok(w2.bob.settle([t("ada", "bob", 1)]), 201)


@pytest.mark.req("S1-002", "S1-180")
def test_settlement_never_overdraws_any_wallet(ops):
    """S1-002: a batch that is net nonnegative for the payer but whose individual entries exceed
    the starting balance commits as a whole; one more unit fails as a whole."""
    ok(ops.ada.settle([t("cy", "bob", 50), t("bob", "dan", 50), t("dan", "cy", 50),
                       t("cy", "ada", 50)]), 201)
    assert ops.cy.balance() == 0 and ops.ada.balance() == 150
    err(ops.ada.settle([t("bob", "cy", 1)]), 409, "insufficient_funds")
    conserve(ops)
