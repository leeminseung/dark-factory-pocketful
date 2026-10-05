"""Stage 1 §7 idempotency, on all five write paths."""
import json

import pytest

from conftest import Api, burst, conserve, err, new_key, ok

PATHS = ["payments", "requests", "pay", "splits", "settlements"]


def call(w, path, body_variant=0, key=None, client=None):
    """Send one request on an idempotent path; body_variant picks a different body."""
    c = client or w.ada
    v = body_variant
    if path == "payments":
        return c.post("/payments", {"to_handle": "bob", "amount": 10 + v}, key=key)
    if path == "requests":
        return c.post("/requests", {"payer_handle": "bob", "amount": 10 + v, "note": "n"},
                      key=key)
    if path == "pay":
        rid = w.pay_rid
        return c.post(f"/requests/{rid}/pay", [{}, {"visibility": "private"},
                                               {"visibility": "public"}][v], key=key)
    if path == "splits":
        return c.post("/splits", {"amount": 30 + v, "participant_handles": ["ada", "bob"],
                                  "note": "n"}, key=key)
    if path == "settlements":
        return c.post("/settlements", {"transfers": [
            {"from_handle": "bob", "to_handle": "cy", "amount": 10 + v}]}, key=key)


@pytest.fixture
def w(opworld):
    opworld.pay_rid = ok(opworld.bob.ask("ada", 100), 201)["request_id"]
    return opworld


def snapshot(w):
    return ({h: c.balance() for h, c in w.clients.items()},
            len(w.ada.feed()), len(w.ada.requests_list()), len(w.bob.requests_list()))


@pytest.mark.req("S1-084", "S1-060")
@pytest.mark.parametrize("path", PATHS)
def test_key_required_on_each_path(w, path):
    """S1-084 "Five write paths require an idempotency key"; absent header is 400
    `missing_idempotency_key` and changes nothing."""
    before = snapshot(w)
    err(call(w, path, key=None), 400, "missing_idempotency_key")
    err(call(w, path, key=""), 400, "missing_idempotency_key")
    assert snapshot(w) == before


@pytest.mark.req("S1-087", "S1-088", "S1-093")
@pytest.mark.parametrize("path", PATHS)
def test_first_use_201_replay_200_identical_and_no_effect(w, path):
    """S1-087 "First use of the key | The normal response, **201**"; S1-088 "Replay: same key,
    same body | **200**, body identical to the original response as a JSON value"; S1-093
    "It makes no further state changes." """
    key = new_key()
    first = ok(call(w, path, key=key), 201)
    after = snapshot(w)
    for _ in range(3):
        assert ok(call(w, path, key=key), 200) == first
    assert snapshot(w) == after
    conserve(w)


@pytest.mark.req("S1-089", "S1-064")
@pytest.mark.parametrize("path", PATHS)
def test_same_key_different_body_is_409(w, path):
    """S1-089 "Same key, different body | 409 `idempotency_key_reuse`" """
    key = new_key()
    ok(call(w, path, key=key), 201)
    after = snapshot(w)
    err(call(w, path, 1, key=key), 409, "idempotency_key_reuse")
    assert snapshot(w) == after


@pytest.mark.req("S1-085")
@pytest.mark.parametrize("path", ["payments", "requests", "splits"])
def test_key_scoped_to_user(w, path):
    """S1-085 "The key is scoped to **the authenticated user**. Two different users may use
    the same key string with no interaction between them." Same key and same body by cy."""
    key = new_key()
    a = ok(call(w, path, key=key), 201)
    body_c = ok(call(w, path, key=key, client=w.cy), 201)
    assert body_c != a
    # and ada's replay is still hers
    assert ok(call(w, path, key=key), 200) == a


@pytest.mark.req("S1-086")
def test_same_key_same_body_different_path_is_not_a_replay(w):
    """S1-086 "The same key with the same body on a different path is a different request,
    not a replay, and must succeed normally." Two different requests paid with one key."""
    r1 = ok(w.bob.ask("ada", 5), 201)["request_id"]
    r2 = ok(w.bob.ask("ada", 6), 201)["request_id"]
    key = new_key()
    p1 = ok(w.ada.pay_request(r1, {}, key=key), 201)
    p2 = ok(w.ada.pay_request(r2, {}, key=key), 201)
    assert p1["payment_id"] != p2["payment_id"]
    assert (p1["amount"], p2["amount"]) == (5, 6)


@pytest.mark.req("S1-090")
@pytest.mark.parametrize("path", PATHS)
def test_key_after_a_4xx_is_a_first_use(w, path):
    """S1-090 "Key reused after the original request failed with 4xx | Treated as a first use" """
    key = new_key()
    bad = {
        "payments": lambda: w.ada.post("/payments", {"to_handle": "nobody", "amount": 10},
                                       key=key),
        "requests": lambda: w.ada.post("/requests", {"payer_handle": "bob", "amount": 0,
                                                     "note": "n"}, key=key),
        "pay": lambda: w.ada.post(f"/requests/{w.pay_rid}/pay", {"visibility": "x"},
                                  key=key),
        "splits": lambda: w.ada.post("/splits", {"amount": 30, "participant_handles": [],
                                                 "note": "n"}, key=key),
        "settlements": lambda: w.ada.post("/settlements", {"transfers": []}, key=key),
    }[path]()
    assert 400 <= bad.status_code < 500
    ok(call(w, path, key=key), 201)
    ok(call(w, path, key=key), 200)


@pytest.mark.req("S1-090", "S1-098")
def test_key_after_insufficient_funds_then_funded(w):
    """S1-090: a 409 insufficient_funds does not claim the key."""
    key = new_key()
    err(w.dan.pay("ada", 50, key=key), 409, "insufficient_funds")
    ok(w.ada.pay("dan", 50), 201)
    ok(w.dan.pay("ada", 50, key=key), 201)
    assert w.dan.balance() == 0
    conserve(w)


@pytest.mark.req("S1-091")
def test_same_json_value_with_other_key_order_and_whitespace_is_a_replay(w):
    """S1-091 ""Same body" means the same JSON value after parsing — key order and whitespace
    do not matter." """
    key = new_key()
    a = b'{"to_handle":"bob","amount":10,"note":"x"}'
    b = b'{ "note" : "x",\n\t"amount" : 10 ,  "to_handle":"bob" }'
    first = ok(w.ada.request("POST", "/payments", content=a, key=key), 201)
    assert ok(w.ada.request("POST", "/payments", content=b, key=key), 200) == first
    assert w.ada.balance() == 10000 - 10


@pytest.mark.req("S1-091", "S1-089")
def test_nested_value_change_is_a_different_body(w):
    """S1-091 same JSON value: a changed transfer inside a settlement is a different body,
    and so is a changed note or an added unknown field."""
    key = new_key()
    t = [{"from_handle": "bob", "to_handle": "cy", "amount": 10}]
    ok(w.ada.settle(t, key=key), 201)
    t2 = [{"from_handle": "bob", "to_handle": "cy", "amount": 10, "note": "x"}]
    err(w.ada.settle(t2, key=key), 409, "idempotency_key_reuse")
    k2 = new_key()
    ok(w.ada.pay("bob", 10, key=k2, note="a"), 201)
    err(w.ada.pay("bob", 10, key=k2, note="a", extra=1), 409, "idempotency_key_reuse")


@pytest.mark.req("S1-092", "S1-003", "S1-012")
@pytest.mark.parametrize("path", PATHS)
def test_concurrent_identical_requests(w, path):
    """S1-092 "For concurrent identical requests with an unused key, exactly one returns 201.
    The others return 200 with the same body. The operation takes effect only once." 50 in
    flight, each from its own connection with the same token."""
    key = new_key()
    clients = [Api(w.ada.base_url, w.ada.token) for _ in range(50)]
    before = snapshot(w)
    try:
        out = burst(lambda i: call(w, path, key=key, client=clients[i]), 50)
    finally:
        for c in clients:
            c.close()
    statuses = sorted(r.status_code for r in out)
    assert statuses.count(201) == 1, statuses
    assert statuses.count(200) == 49, statuses
    bodies = [r.json() for r in out]
    assert all(b == bodies[0] for b in bodies)
    bal, feed_n, ada_rq, bob_rq = snapshot(w)
    if path in ("payments", "pay", "settlements"):
        assert feed_n == before[1] + 1
    if path in ("requests", "splits"):
        assert bob_rq == before[3] + 1
    conserve(w)


@pytest.mark.req("S1-093")
def test_replay_after_the_request_changed(w):
    """S1-093 "A successful replay returns the original response, even after the resource
    changes or is cancelled." A created request later cancelled; a split whose request was
    declined; a paid request."""
    key = new_key()
    created = ok(w.ada.ask("bob", 77, key=key), 201)
    ok(w.ada.post(f"/requests/{created['request_id']}/cancel"), 200)
    again = ok(w.ada.ask("bob", 77, key=key), 200)
    assert again == created and again["status"] == "pending"
    sk = new_key()
    sp = ok(w.ada.split(9, ["ada", "bob", "cy"], key=sk), 201)
    ok(w.bob.post(f"/requests/{sp['requests'][0]['request_id']}/decline"), 200)
    assert ok(w.ada.split(9, ["ada", "bob", "cy"], key=sk), 200) == sp
    assert len([r for r in w.ada.requests_list(direction="outgoing")]) == 3


@pytest.mark.req("S1-093")
def test_replay_after_balance_dropped_still_200(w):
    """S1-093: the replay of a payment is answered from the original even when the caller
    could no longer afford it."""
    key = new_key()
    first = ok(w.cy.pay("ada", 500, key=key), 201)
    assert w.cy.balance() == 0
    assert ok(w.cy.pay("ada", 500, key=key), 200) == first
    assert w.cy.balance() == 0


@pytest.mark.req("S1-094")
@pytest.mark.parametrize("path,invalid", [
    ("payments", {"to_handle": "bob", "amount": -1}),
    ("payments", {"to_handle": "nobody", "amount": 10}),
    ("payments", {"to_handle": "ada", "amount": 10}),
    ("payments", {"amount": 10}),
    ("requests", {"payer_handle": "bob", "amount": "x", "note": "n"}),
    ("pay", {"visibility": "nope"}),
    ("splits", {"amount": 30, "participant_handles": ["ada", "ada"], "note": "n"}),
    ("settlements", {"transfers": []}),
    ("settlements", {"transfers": [{"from_handle": "bob", "to_handle": "bob", "amount": 1}]}),
])
def test_claimed_key_resolved_before_validation(w, path, invalid):
    """S1-094 "an already claimed key is resolved before endpoint field validation or
    current-resource checks. Thus changing a successful request to an invalid body with the
    same key still returns `409 idempotency_key_reuse`." """
    key = new_key()
    ok(call(w, path, key=key), 201)
    target = {"payments": "/payments", "requests": "/requests", "splits": "/splits",
              "settlements": "/settlements", "pay": f"/requests/{w.pay_rid}/pay"}[path]
    err(w.ada.post(target, invalid, key=key), 409, "idempotency_key_reuse")


@pytest.mark.req("S1-094", "S1-119")
def test_claimed_key_resolved_before_resource_checks(w):
    """S1-094 "current-resource checks": a different body on a paid request with the same key
    is reuse, not request_not_pending."""
    key = new_key()
    ok(w.ada.pay_request(w.pay_rid, {}, key=key), 201)
    err(w.ada.pay_request(w.pay_rid, {"visibility": "private"}, key=key),
        409, "idempotency_key_reuse")
