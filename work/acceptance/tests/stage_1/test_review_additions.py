"""Stage 1 rows added after the coordinator's review: S1-187..S1-190."""
import json

import pytest

from conftest import Api, err, fixture, new_key, ok, user

PATHS = ["payments", "requests", "pay", "splits", "settlements"]


# ---- S1-187 -------------------------------------------------------------------------

@pytest.mark.req("S1-187", "S1-063")
@pytest.mark.parametrize("action", ["decline", "cancel"])
@pytest.mark.parametrize("rid", ["rq_nope", "0", "x" * 64, "x" * 65])
def test_decline_and_cancel_unknown_request(world, action, rid):
    """S1-187 "404 | `not_found` | No such resource" — decline and cancel of an unknown
    request, for any caller."""
    for c in (world.ada, world.bob):
        err(c.post(f"/requests/{rid}/{action}"), 404, "not_found")


@pytest.mark.req("S1-187")
@pytest.mark.parametrize("action", ["decline", "cancel"])
def test_decline_and_cancel_a_payment_id(world, action):
    """S1-187 a payment id is not a request id: 404."""
    pid = ok(world.ada.pay("bob", 1), 201)["payment_id"]
    err(world.ada.post(f"/requests/{pid}/{action}"), 404, "not_found")


# ---- S1-188 -------------------------------------------------------------------------

def raw_post(c, path, text, key=True):
    return c.request("POST", path, content=text.encode(), key=new_key() if key else None)


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


@pytest.mark.req("S1-188", "S1-029")
@pytest.mark.parametrize("num", ["1000.0", "1e3", "1.0E3", "10000e-1"])
def test_response_amounts_are_integers(opworld, num):
    """S1-188 "Every amount in the API is an integer count of its minor units" — the input
    written as `1000.0` / `1e3` comes back as the JSON integer 1000 everywhere."""
    w = opworld
    p = ok(raw_post(w.ada, "/payments", '{"to_handle": "bob", "amount": %s}' % num), 201)
    assert is_int(p["amount"]) and p["amount"] == 1000
    r = ok(raw_post(w.bob, "/requests",
                    '{"payer_handle": "ada", "amount": %s, "note": "n"}' % num), 201)
    assert is_int(r["amount"]) and r["amount"] == 1000
    paid = ok(w.ada.pay_request(r["request_id"]), 201)
    assert is_int(paid["amount"]) and paid["amount"] == 1000
    sp = ok(raw_post(w.ada, "/splits", '{"amount": %s, "participant_handles": '
                                       '["ada", "bob", "cy"], "note": "n"}' % num), 201)
    assert is_int(sp["amount"]) and sp["amount"] == 1000
    assert [s["amount"] for s in sp["shares"]] == [334, 333, 333]
    assert all(is_int(s["amount"]) for s in sp["shares"])
    assert all(is_int(x["amount"]) for x in sp["requests"])
    st = ok(raw_post(w.ada, "/settlements", '{"transfers": [{"from_handle": "bob", '
                                            '"to_handle": "cy", "amount": %s}]}' % num), 201)
    assert is_int(st["payments"][0]["amount"]) and st["payments"][0]["amount"] == 1000
    me = w.ada.me()
    assert is_int(me["balance"]) and me["balance"] == 10000 - 1000 - 1000
    for c in w.clients.values():
        assert is_int(c.me()["balance"])
        for item in c.feed():
            assert is_int(item["amount"]), item
        for item in c.requests_list():
            assert is_int(item["amount"]), item


@pytest.mark.req("S1-188")
def test_amounts_are_integers_in_the_raw_json_text(world):
    """S1-188: checked on the response text itself — no `1000.0` or `1e3` is written back."""
    r = raw_post(world.ada, "/payments", '{"to_handle": "bob", "amount": 1e3}')
    assert r.status_code == 201
    assert '"amount":1000' in r.text.replace(" ", "")
    me = world.ada.get("/me")
    assert '"balance":9000' in me.text.replace(" ", "")


# ---- S1-189 -------------------------------------------------------------------------

def call(w, path, client, body_text=None, key=None, token=...):
    rid = w.pay_rid
    bodies = {
        "payments": ("/payments", {"to_handle": "bob", "amount": 10}),
        "requests": ("/requests", {"payer_handle": "bob", "amount": 10, "note": "n"}),
        "pay": (f"/requests/{rid}/pay", {}),
        "splits": ("/splits", {"amount": 30, "participant_handles": ["ada", "bob"],
                               "note": "n"}),
        "settlements": ("/settlements", {"transfers": [
            {"from_handle": "bob", "to_handle": "cy", "amount": 10}]}),
    }
    target, body = bodies[path]
    content = (body_text if body_text is not None else json.dumps(body)).encode()
    return client.request("POST", target, content=content, key=key, token=token)


@pytest.fixture
def w(opworld):
    opworld.pay_rid = ok(opworld.bob.ask("ada", 100), 201)["request_id"]
    return opworld


@pytest.mark.req("S1-189", "S1-061")
@pytest.mark.parametrize("path", PATHS)
def test_claimed_key_does_not_override_401(w, path):
    """S1-189 "After the body has parsed as a JSON object and the caller is authenticated, an
    already claimed key is resolved" — with no token or an unknown token, the same key and the
    same body is still 401, not a 200 replay."""
    key = new_key()
    ok(call(w, path, w.ada, key=key), 201)
    err(call(w, path, w.ada, key=key, token=None), 401, "unauthenticated")
    err(call(w, path, w.ada, key=key, token="unknown-token"), 401, "unauthenticated")
    assert ok(call(w, path, w.ada, key=key), 200)


@pytest.mark.req("S1-189", "S1-059")
@pytest.mark.parametrize("path", PATHS)
@pytest.mark.parametrize("text", ["{nope", "", '{"amount": 1'])
def test_claimed_key_does_not_override_400(w, path, text):
    """S1-189 "After the body has parsed as a JSON object ..." — an unparseable body with a
    claimed key is still 400 `malformed_request`, not 409 or 200."""
    key = new_key()
    ok(call(w, path, w.ada, key=key), 201)
    err(call(w, path, w.ada, body_text=text, key=key), 400, "malformed_request")


@pytest.mark.req("S1-189")
@pytest.mark.parametrize("path", PATHS)
def test_other_users_claimed_key_is_not_theirs(w, path):
    """S1-189 with S1-085: the key is resolved for the authenticated caller only — cy using
    ada's claimed key gets cy's own first-use result, not ada's replay."""
    key = new_key()
    first = ok(call(w, path, w.ada, key=key), 201)
    if path in ("pay", "settlements"):
        err(call(w, path, w.cy, key=key), 403, "forbidden")
        return
    other = ok(call(w, path, w.cy, key=key), 201)
    assert other != first


# ---- S1-190 -------------------------------------------------------------------------

def seeded_fixture():
    users = [user("ada", 100000), user("bob", 100000), user("cy", 0)]
    # ids shaped like ones a service might generate
    users[0]["id"], users[1]["id"], users[2]["id"] = "u_1", "u_2", "u_3"
    payments = [{"id": pid, "from_user_id": "u_1", "to_user_id": "u_2", "amount": 1,
                 "note": f"seed {pid}", "visibility": "public"}
                for pid in [f"p_{i}" for i in range(1, 31)] + ["1", "2", "p1", "p_0"]]
    requests = [{"id": rid, "requester_id": "u_2", "payer_id": "u_1", "amount": 7,
                 "note": f"seed {rid}", "status": "pending"}
                for rid in [f"rq_{i}" for i in range(1, 31)] + ["3", "4", "rq1", "rq_0"]]
    return fixture(users=users, payments=payments, requests=requests,
                   operators=["u_1"])


def all_ids(w):
    pays = []
    off = 0
    while True:
        body = ok(w.ada.get("/activity", params={"limit": 200, "offset": off}), 200)
        pays += [p["payment_id"] for p in body["payments"]]
        if not body["has_more"]:
            break
        off += 200
    reqs = []
    off = 0
    while True:
        body = ok(w.ada.get("/requests", params={"limit": 200, "offset": off}), 200)
        reqs += [r["request_id"] for r in body["requests"]]
        if not body["has_more"]:
            break
        off += 200
    return pays, reqs


@pytest.mark.req("S1-190", "S1-027", "S1-057")
def test_generated_ids_never_collide_with_seeded_ids(make_world, api):
    """S1-190 ids the service generates never collide with fixture ids; `/requests/{id}/pay`
    on a seeded id hits the seeded request and on a new id the new one."""
    w = make_world(seeded_fixture())
    new_pays = [ok(w.ada.pay("bob", 2), 201)["payment_id"] for _ in range(35)]
    new_reqs = [ok(w.bob.ask("ada", 3), 201)["request_id"] for _ in range(35)]
    sp = ok(w.bob.split(10, ["bob", "ada"]), 201)
    new_reqs.append(sp["requests"][0]["request_id"])
    st = ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 1}]), 201)
    new_pays.append(st["payments"][0]["payment_id"])
    su = ok(w.ada.signup("fresh@example.com"), 201)
    assert su["user_id"] not in ("u_1", "u_2", "u_3")
    assert api(su["token"]).me()["handle"] == "fresh"
    assert w.ada.me()["user_id"] == "u_1"
    pays, reqs = all_ids(w)
    assert len(pays) == len(set(pays)) == 34 + 36
    assert len(reqs) == len(set(reqs)) == 34 + 36
    assert set(new_pays) <= set(pays) and set(new_reqs) <= set(reqs)
    # pay targets the right request: seeded rq_1 (7) and a new one (3)
    p = ok(w.ada.pay_request("rq_1"), 201)
    assert p["request_id"] == "rq_1" and p["amount"] == 7
    q = ok(w.ada.pay_request(new_reqs[0]), 201)
    assert q["request_id"] == new_reqs[0] and q["amount"] == 3
    listed = {r["request_id"]: r for r in w.ada.requests_list()}
    assert listed["rq_1"]["status"] == "paid" and listed["rq_1"]["note"] == "seed rq_1"
    assert listed["rq_2"]["status"] == "pending"
    assert listed[new_reqs[0]]["status"] == "paid"
    assert p["payment_id"] not in [x for x in pays]
    assert q["payment_id"] not in pays and q["payment_id"] != p["payment_id"]


@pytest.mark.req("S1-190", "S1-161")
def test_generated_ids_never_collide_with_imported_ids(make_world, api, reset):
    """S1-190 after an import, new ids differ from every imported id (the service must not
    restart its id sequence)."""
    w = make_world(fixture(operators=["u_ada"]))
    made_p = [ok(w.ada.pay("bob", 1), 201)["payment_id"] for _ in range(20)]
    made_r = [ok(w.bob.ask("ada", 1), 201)["request_id"] for _ in range(20)]
    made_s = [ok(w.ada.split(2, ["ada", "bob"]), 201)["split_id"] for _ in range(5)]
    made_st = [ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 1}]),
                  201)["settlement_id"] for _ in range(5)]
    snap = ok(api().get("/_test/export"), 200)
    reset(fixture(users=[user("zz", 1)]))
    ok(api().post("/_test/import", snap), 204)
    new_p = [ok(w.ada.pay("bob", 1), 201)["payment_id"] for _ in range(25)]
    new_r = [ok(w.bob.ask("ada", 1), 201)["request_id"] for _ in range(25)]
    new_s = [ok(w.ada.split(2, ["ada", "bob"]), 201)["split_id"] for _ in range(6)]
    new_st = [ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 1}]),
                 201)["settlement_id"] for _ in range(6)]
    assert not set(new_p) & set(made_p)
    assert not set(new_r) & set(made_r)
    assert not set(new_s) & set(made_s)
    assert not set(new_st) & set(made_st)
    pays, reqs = all_ids(w)
    assert len(pays) == len(set(pays))
    assert len(reqs) == len(set(reqs))
    # an old request id still names the old request
    p = ok(w.ada.pay_request(made_r[0]), 201)
    assert p["request_id"] == made_r[0]
    assert next(r for r in w.ada.requests_list() if r["request_id"] == new_r[0])[
        "status"] == "pending"


@pytest.mark.req("S1-190", "S1-031")
def test_signup_user_ids_never_collide_with_seeded_ids(make_world, api):
    """S1-190: seeded users with ids `u_1`.. `u_5` (the §6 example signup id is `u_1`); five
    signups get five other ids, and each token is its own user."""
    users = [user(f"s{i}", 10) for i in range(1, 6)]
    for i, u in enumerate(users, 1):
        u["id"] = f"u_{i}"
    w = make_world(fixture(users=users))
    seen = set()
    for i in range(5):
        s = ok(w.s1.signup(f"n{i}@example.com"), 201)
        assert s["user_id"] not in {f"u_{k}" for k in range(1, 6)} | seen
        seen.add(s["user_id"])
        assert api(s["token"]).me()["handle"] == f"n{i}"
    for i in range(1, 6):
        me = w.clients[f"s{i}"].me()
        assert me["user_id"] == f"u_{i}" and me["balance"] == 10
