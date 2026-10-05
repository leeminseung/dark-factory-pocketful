"""Stage 1 §8 splits and activity, §9 rounding, §4 feed contract."""
import pytest

from conftest import (assert_id, assert_timestamp, conserve, err, err_any, fixture, ok,
                      seeded_total, ts, user)

MAX = 1_000_000_000


def expected_shares(amount, n):
    """§9 stated rule: equal shares, the first `amount % n` participants get one more."""
    base, extra = divmod(amount, n)
    return [base + 1 if i < extra else base for i in range(n)]


@pytest.fixture
def five(make_world):
    """ada, bob, cy, dan, eve with 1000 each."""
    return make_world(fixture(users=[user("ada", 1000), user("bob", 1000), user("cy", 1000),
                                     user("dan", 1000), user("eve", 1000)]))


# ---- §9 table ----------------------------------------------------------------------

@pytest.mark.parametrize("rid,amount,shares", [
    ("S1-144", 1000, [334, 333, 333]),
    ("S1-145", 1, [1, 0, 0]),
    ("S1-146", 10, [4, 3, 3]),
    ("S1-147", 999, [333, 333, 333]),
    ("S1-148", 5, [1, 1, 1, 1, 1]),
])
@pytest.mark.req("S1-143", "S1-144", "S1-145", "S1-146", "S1-147", "S1-148")
def test_rounding_table(five, rid, amount, shares):
    """§9 table rows S1-144..S1-148 ("1000 | 3 | 334, 333, 333" ... "5 | 5 | 1, 1, 1, 1, 1")."""
    handles = ["ada", "bob", "cy", "dan", "eve"][:len(shares)]
    sp = ok(five.ada.split(amount, handles), 201)
    assert [s["amount"] for s in sp["shares"]] == shares
    assert [s["handle"] for s in sp["shares"]] == handles
    assert [r["amount"] for r in sp["requests"]] == shares[1:]


@pytest.mark.req("S1-143")
@pytest.mark.parametrize("amount,n", [(7, 4), (2, 5), (MAX, 3), (MAX, 5), (MAX - 1, 4),
                                      (4, 5), (101, 2)])
def test_rounding_rule(five, amount, n):
    """S1-143 "Shares must be whole minor units, sum exactly to `amount` and differ by at most
    one minor unit. When the amount does not divide evenly, the larger shares go to the first
    participants in `participant_handles` order." """
    handles = ["ada", "bob", "cy", "dan", "eve"][:n]
    shares = [s["amount"] for s in ok(five.ada.split(amount, handles), 201)["shares"]]
    assert shares == expected_shares(amount, n)
    assert sum(shares) == amount and all(isinstance(s, int) for s in shares)


@pytest.mark.req("S1-143", "S1-132")
def test_rounding_when_caller_is_not_first(five):
    """S1-143 order of `participant_handles`, wherever the caller stands: the extra units go to
    the first listed, even if they are not the caller."""
    sp = ok(five.ada.split(11, ["bob", "cy", "ada", "dan"]), 201)
    assert sp["shares"] == [{"handle": "bob", "amount": 3}, {"handle": "cy", "amount": 3},
                            {"handle": "ada", "amount": 3}, {"handle": "dan", "amount": 2}]
    assert [(r["payer_handle"], r["amount"]) for r in sp["requests"]] == \
        [("bob", 3), ("cy", 3), ("dan", 2)]


@pytest.mark.req("S1-149")
def test_order_moves_the_extra_unit(five):
    """S1-149 "Splitting the same amount among the same people in a different
    `participant_handles` order gives the extra unit to a different person." """
    a = ok(five.ada.split(10, ["ada", "bob", "cy"]), 201)["shares"]
    b = ok(five.ada.split(10, ["bob", "cy", "ada"]), 201)["shares"]
    c = ok(five.ada.split(10, ["cy", "ada", "bob"]), 201)["shares"]
    assert {s["handle"]: s["amount"] for s in a} == {"ada": 4, "bob": 3, "cy": 3}
    assert {s["handle"]: s["amount"] for s in b} == {"bob": 4, "cy": 3, "ada": 3}
    assert {s["handle"]: s["amount"] for s in c} == {"cy": 4, "ada": 3, "bob": 3}


@pytest.mark.req("S1-150")
def test_zero_share_still_requests(five):
    """S1-150 "A share of `0` is legal and still produces a request for that participant." """
    sp = ok(five.ada.split(2, ["ada", "bob", "cy", "dan", "eve"]), 201)
    assert [s["amount"] for s in sp["shares"]] == [1, 1, 0, 0, 0]
    assert [(r["payer_handle"], r["amount"], r["status"]) for r in sp["requests"]] == \
        [("bob", 1, "pending"), ("cy", 0, "pending"), ("dan", 0, "pending"),
         ("eve", 0, "pending")]
    for h in ("cy", "dan", "eve"):
        mine = five.clients[h].requests_list()
        assert len(mine) == 1 and mine[0]["amount"] == 0


@pytest.mark.req("S1-151")
def test_splits_are_independent(five):
    """S1-151 "Each split's shares are independent of previous splits." The same split three
    times gives the same shares each time (no carried remainder)."""
    for _ in range(3):
        sp = ok(five.ada.split(10, ["ada", "bob", "cy"]), 201)
        assert [s["amount"] for s in sp["shares"]] == [4, 3, 3]


@pytest.mark.req("S1-151", "S1-001")
def test_paid_splits_conserve_the_total(five):
    """S1-151 "After any number of splits have been paid in full, wallet balances must still
    sum exactly to the seeded total." """
    w = five
    gained = 0
    for amount, handles in [(1000, ["ada", "bob", "cy"]), (1, ["bob", "ada", "cy"]),
                            (7, ["ada", "bob", "cy", "dan", "eve"]), (999, ["cy", "ada"])]:
        sp = ok(w.ada.split(amount, handles), 201)
        for r in sp["requests"]:
            if r["amount"] > 0:
                ok(w.clients[r["payer_handle"]].pay_request(r["request_id"]), 201)
                gained += r["amount"]
    assert w.ada.balance() == 1000 + gained
    assert w.total() == seeded_total(w.fixture)


# ---- POST /splits ------------------------------------------------------------------------

@pytest.mark.req("S1-132", "S1-133")
def test_caller_omitted(five):
    """S1-132 "The caller may be included in `participant_handles` or omitted." S1-133 "A
    request is created for every participant except the caller" — omitted caller: every
    listed participant gets one, the first included."""
    sp = ok(five.ada.split(10, ["bob", "cy", "dan"]), 201)
    assert [s["handle"] for s in sp["shares"]] == ["bob", "cy", "dan"]
    assert [s["amount"] for s in sp["shares"]] == [4, 3, 3]
    assert [r["payer_handle"] for r in sp["requests"]] == ["bob", "cy", "dan"]
    assert [r["amount"] for r in sp["requests"]] == [4, 3, 3]


@pytest.mark.req("S1-133")
def test_split_requests_are_ordinary_pending_requests(five):
    """S1-133 "each for that participant's share, with the caller as requester." """
    sp = ok(five.ada.split(9, ["ada", "bob", "cy"]), 201)
    for r in sp["requests"]:
        assert r["requester_handle"] == "ada" and r["requester_id"] == "u_ada"
        assert r["status"] == "pending" and r["payment_id"] is None
        assert r["currency"] == "EUR"
        assert_id(r["request_id"])
    listed = {r["request_id"]: r for r in five.ada.requests_list(direction="outgoing")}
    for r in sp["requests"]:
        assert listed[r["request_id"]]["amount"] == r["amount"]
    bob = five.bob.requests_list(direction="incoming")
    assert [r["request_id"] for r in bob] == [sp["requests"][0]["request_id"]]


@pytest.mark.req("S1-134")
def test_split_response_shape(five):
    """S1-134 `shares` covers every participant including the caller, in order, sums to
    `amount`; `requests` every participant except the caller, same order; plus split_id,
    amount, currency, note, created_at."""
    sp = ok(five.ada.split(3000, ["bob", "ada", "cy"], note="dinner"), 201)
    assert_id(sp["split_id"])
    assert sp["amount"] == 3000 and sp["currency"] == "EUR" and sp["note"] == "dinner"
    assert_timestamp(sp["created_at"])
    assert sp["shares"] == [{"handle": "bob", "amount": 1000},
                            {"handle": "ada", "amount": 1000},
                            {"handle": "cy", "amount": 1000}]
    assert [r["payer_handle"] for r in sp["requests"]] == ["bob", "cy"]


@pytest.mark.req("S1-135")
@pytest.mark.parametrize("amount", [0, -5, MAX + 1, 1.5, "10", True, None])
def test_split_amount_rules(five, amount):
    """S1-135 "`amount` below 1, above 1000000000, or not an integer | 422" """
    err(five.ada.split(amount, ["ada", "bob"]), 422, "validation_failed")
    assert five.bob.requests_list() == []


@pytest.mark.req("S1-135")
def test_split_amount_bounds(five):
    """S1-135 1 and 1000000000 are valid."""
    ok(five.ada.split(1, ["ada", "bob"]), 201)
    ok(five.ada.split(MAX, ["ada", "bob"]), 201)


@pytest.mark.req("S1-136")
@pytest.mark.parametrize("handles", [[], ["ada", "ada"], ["bob", "cy", "bob"],
                                     ["bob", "bob"]])
def test_split_participants_empty_or_duplicate(five, handles):
    """S1-136 "`participant_handles` empty, or containing a duplicate handle | 422" — and no
    request is created."""
    err(five.ada.split(10, handles), 422, "validation_failed")
    assert five.ada.requests_list() == []


@pytest.mark.req("S1-137")
def test_split_note_length(five):
    """S1-137 "`note` longer than 200 characters | 422 `validation_failed`" """
    ok(five.ada.split(10, ["ada", "bob"], note="😀" * 200), 201)
    err(five.ada.split(10, ["ada", "bob"], note="😀" * 201), 422, "validation_failed")


@pytest.mark.req("S1-138")
@pytest.mark.parametrize("handles", [["ada", "nobody"], ["nobody"], ["bob", "cy", "zz"]])
def test_split_unknown_handle(five, handles):
    """S1-138 "Any handle is unknown | 404 `not_found`" — and nothing is created for the
    known participants."""
    err(five.ada.split(10, handles), 404, "not_found")
    assert five.bob.requests_list() == [] and five.cy.requests_list() == []


@pytest.mark.req("S1-136", "S1-138", "S1-073")
def test_split_with_a_thousand_unknown_participants(five):
    """S1-138 a long list of unknown handles is 404 (no participant limit is stated)."""
    err_any(five.ada.split(100, [f"h{i}" for i in range(1000)]),
            {(404, "not_found"), (422, "validation_failed")})


@pytest.mark.req("S1-139")
def test_only_the_caller(five):
    """S1-139 "A split whose only participant is the caller is **valid**: it computes one
    share, creates zero requests, and returns `"requests": []`." """
    sp = ok(five.ada.split(999, ["ada"]), 201)
    assert sp["shares"] == [{"handle": "ada", "amount": 999}] and sp["requests"] == []
    assert five.ada.requests_list() == []


@pytest.mark.req("S1-140")
def test_split_checks_no_balance(make_world):
    """S1-140 "Nothing about a split checks anyone's balance." A caller and participants with
    0 balance split the maximum."""
    w = make_world(fixture(users=[user("ada", 0), user("bob", 0), user("cy", 0)]))
    sp = ok(w.ada.split(MAX, ["ada", "bob", "cy"]), 201)
    assert [r["amount"] for r in sp["requests"]] == [333333333, 333333333]
    assert w.ada.balance() == 0 and w.bob.balance() == 0


@pytest.mark.req("S1-047")
def test_split_is_not_a_feed_item(five):
    """S1-047 "A split is not a feed item. The requests it creates are visible to their own two
    parties, and the payments that eventually fulfil them follow the rule above." """
    sp = ok(five.ada.split(10, ["ada", "bob", "cy"]), 201)
    for c in five.clients.values():
        assert c.feed() == []
    assert five.dan.requests_list() == []
    assert len(five.cy.requests_list()) == 1 and len(five.bob.requests_list()) == 1
    assert len(five.ada.requests_list()) == 2
    p = ok(five.bob.pay_request(sp["requests"][0]["request_id"], {"visibility": "private"}),
           201)
    assert [x["payment_id"] for x in five.ada.feed()] == [p["payment_id"]]
    assert five.dan.feed() == [] and five.cy.feed() == []
    q = ok(five.cy.pay_request(sp["requests"][1]["request_id"]), 201)
    assert [x["payment_id"] for x in five.dan.feed()] == [q["payment_id"]]


# ---- §4 feed contract ----------------------------------------------------------------------

@pytest.mark.req("S1-044", "S1-048", "S1-049")
def test_feed_if_and_only_if(five):
    """S1-044 "A payment appears for a caller **if and only if** its `visibility` is
    `public`, **or** the caller is its sender or its receiver." Every pair of sender/receiver
    and both visibilities, seen by every user."""
    w = five
    made = []
    for s, r in [("ada", "bob"), ("bob", "cy"), ("cy", "ada")]:
        for vis in ("public", "private"):
            p = ok(w.clients[s].pay(r, 1, visibility=vis), 201)
            made.append((p, s, r, vis))
    for h, c in w.clients.items():
        seen = {x["payment_id"]: x for x in c.feed()}
        for p, s, r, vis in made:
            should = vis == "public" or h in (s, r)
            assert (p["payment_id"] in seen) == should, (h, s, r, vis)
            if should:
                assert seen[p["payment_id"]]["visibility"] == vis


@pytest.mark.req("S1-049", "S1-048")
def test_private_is_shown_to_the_receiver(world):
    """S1-049 "A `private` payment is hidden from third parties, not from its own receiver."
    S1-048 "seen identically by both parties" """
    p = ok(world.ada.pay("bob", 5, visibility="private", note="ssh"), 201)
    a = [x for x in world.ada.feed() if x["payment_id"] == p["payment_id"]]
    b = [x for x in world.bob.feed() if x["payment_id"] == p["payment_id"]]
    assert a == b and len(a) == 1 and a[0]["visibility"] == "private"
    assert world.cy.feed() == [] and world.dan.feed() == []


@pytest.mark.req("S1-045")
def test_requests_never_in_the_feed(world):
    """S1-045 "Requests never appear in the activity feed" — pending, declined or cancelled;
    only the payment for a paid one."""
    a = ok(world.bob.ask("ada", 1), 201)["request_id"]
    b = ok(world.bob.ask("ada", 2), 201)["request_id"]
    ok(world.ada.post(f"/requests/{b}/decline"), 200)
    c = ok(world.bob.ask("ada", 3), 201)["request_id"]
    ok(world.bob.post(f"/requests/{c}/cancel"), 200)
    for cl in world.clients.values():
        assert cl.feed() == []
    p = ok(world.ada.pay_request(a), 201)
    items = world.cy.feed()
    assert len(items) == 1 and items[0]["payment_id"] == p["payment_id"]
    assert set(items[0]) >= {"payment_id", "from_handle", "to_handle", "amount"}


@pytest.mark.req("S1-046")
def test_requests_list_never_leaks(world):
    """S1-046 "returns only requests where the caller is the requester or the payer." under
    every filter."""
    ok(world.bob.ask("ada", 1), 201)
    rid = ok(world.bob.ask("ada", 1), 201)["request_id"]
    ok(world.ada.pay_request(rid), 201)
    for params in ({}, {"direction": "incoming"}, {"direction": "outgoing"},
                   {"status": "pending"}, {"status": "paid"}, {"limit": 200},
                   {"offset": 0}):
        assert world.cy.requests_list(**params) == []


# ---- GET /activity -------------------------------------------------------------------------

@pytest.mark.req("S1-141")
def test_activity_shape_and_newest_first(world):
    """S1-141 "Payments visible to the caller by the feed contract in §4, newest first by
    `created_at`." `{ "payments": [...], "has_more": ... }` with full payment items."""
    made = [ok(world.ada.pay("bob", i + 1), 201) for i in range(4)]
    body = ok(world.cy.get("/activity"), 200)
    assert set(body) >= {"payments", "has_more"} and body["has_more"] is False
    items = body["payments"]
    assert {x["payment_id"] for x in items} == {p["payment_id"] for p in made}
    times = [ts(x["created_at"]) for x in items]
    assert times == sorted(times, reverse=True)
    for x in items:
        p = next(m for m in made if m["payment_id"] == x["payment_id"])
        for k in ("from_user_id", "from_handle", "to_user_id", "to_handle", "amount",
                  "currency", "note", "visibility", "request_id", "created_at"):
            assert x[k] == p[k], k


@pytest.mark.req("S1-142", "S1-130")
def test_activity_paging(world):
    """S1-142 "`limit` and `offset` behave exactly as in `GET /requests`": default 50,
    has_more, offsets."""
    from conftest import burst
    burst(lambda i: ok(world.ada.pay("bob", 1), 201), 51, workers=10)
    body = ok(world.cy.get("/activity"), 200)
    assert len(body["payments"]) == 50 and body["has_more"] is True
    body = ok(world.cy.get("/activity", params={"offset": 50}), 200)
    assert len(body["payments"]) == 1 and body["has_more"] is False
    body = ok(world.cy.get("/activity", params={"limit": 51}), 200)
    assert len(body["payments"]) == 51 and body["has_more"] is False
    body = ok(world.cy.get("/activity", params={"limit": 200, "offset": 51}), 200)
    assert body["payments"] == [] and body["has_more"] is False


@pytest.mark.req("S1-142", "S1-071", "S1-072")
@pytest.mark.parametrize("params", [{"limit": "0"}, {"limit": "201"}, {"limit": "-5"},
                                    {"offset": "-1"}, {"offset": "abc"}, {"limit": "1e2"}])
def test_activity_bad_paging(world, params):
    """S1-142 / S1-071 / S1-072 out of range is 422."""
    err(world.ada.get("/activity", params=params), 422, "validation_failed")


@pytest.mark.req("S1-142", "S1-026")
def test_activity_ignores_request_filters(world):
    """S1-026: `direction`/`status` are not activity parameters, so they are ignored."""
    ok(world.ada.get("/activity", params={"direction": "both", "status": "open"}), 200)
