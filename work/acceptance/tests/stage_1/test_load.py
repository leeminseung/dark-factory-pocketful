"""Stage 1 §1 invariants and §2 limits under concurrent load (50 in flight)."""
import random
import threading
import time

import pytest

from conftest import (Api, burst, conserve, err, fixture, new_key, ok, seeded_total, user,
                      PASSWORD)


def pool(w, handle, n):
    return [Api(w.clients[handle].base_url, w.clients[handle].token) for _ in range(n)]


def close_all(cs):
    for c in cs:
        c.close()


@pytest.mark.req("S1-001", "S1-002", "S1-012", "S1-073", "S1-013")
def test_random_payments_among_ten_wallets(make_world):
    """S1-001 "The sum of wallet balances always equals the total seeded"; S1-002 "No wallet
    balance may be negative, including transiently." 600 random payments, 50 in flight, while
    a watcher reads every balance; every call answers within 5 s with no 5xx."""
    fx = fixture(users=[user(f"w{i}", 300) for i in range(10)])
    w = make_world(fx)
    names = list(w.clients)
    clients = {h: pool(w, h, 5) for h in names}
    rng = random.Random(7)
    plan = []
    for _ in range(600):
        a, b = rng.sample(names, 2)
        plan.append((a, b, rng.randint(1, 120)))
    stop = threading.Event()
    seen_negative = []

    def watch():
        cs = {h: Api(w.clients[h].base_url, w.clients[h].token) for h in names}
        while not stop.is_set():
            for h, c in cs.items():
                b = c.balance()
                if b < 0:
                    seen_negative.append((h, b))
        close_all(cs.values())

    t = threading.Thread(target=watch)
    t.start()
    try:
        out = burst(lambda i: clients[plan[i][0]][i % 5].pay(plan[i][1], plan[i][2]), 600)
    finally:
        stop.set()
        t.join()
        for cs in clients.values():
            close_all(cs)
    codes = {r.status_code for r in out}
    assert codes <= {201, 409}, codes
    for r in out:
        if r.status_code == 409:
            assert r.json()["error"]["code"] == "insufficient_funds"
    assert not seen_negative, seen_negative[:5]
    conserve(w)
    # the feed holds exactly the successful payments
    n_ok = sum(r.status_code == 201 for r in out)
    total_feed = 0
    off = 0
    while True:
        body = ok(w.w0.get("/activity", params={"limit": 200, "offset": off}), 200)
        total_feed += len(body["payments"])
        if not body["has_more"]:
            break
        off += 200
    assert total_feed == n_ok


@pytest.mark.req("S1-002", "S1-098")
def test_drain_one_wallet_in_parts(make_world):
    """S1-002: 1000 in one wallet, 50 concurrent payments of 30: at most 33 succeed, the rest
    are 409, and the balance ends at exactly 1000 - 30 x successes, never below zero."""
    w = make_world(fixture(users=[user("ada", 1000), user("bob", 0)]))
    cs = pool(w, "ada", 50)
    try:
        out = burst(lambda i: cs[i].pay("bob", 30), 50)
    finally:
        close_all(cs)
    n = sum(r.status_code == 201 for r in out)
    assert n == 33, f"{n} succeeded; 33 x 30 = 990 fit in 1000"
    assert all(r.status_code in (201, 409) for r in out)
    assert w.ada.balance() == 1000 - 30 * n and w.bob.balance() == 30 * n


@pytest.mark.req("S1-001", "S1-002", "S1-013")
def test_ring_of_three_wallets(make_world):
    """S1-001/S1-002: a cycle a->b->c->a, all at once, cannot deadlock (every call within 5 s)
    and ends where it started."""
    w = make_world(fixture(users=[user("a", 100), user("b", 100), user("c", 100)]))
    ring = {"a": "b", "b": "c", "c": "a"}
    cs = {h: pool(w, h, 16) for h in ring}
    try:
        out = burst(lambda i: cs["abc"[i % 3]][i // 3 % 16].pay(ring["abc"[i % 3]], 10), 150)
    finally:
        for v in cs.values():
            close_all(v)
    assert all(r.status_code in (201, 409) for r in out)
    conserve(w)


@pytest.mark.req("S1-003", "S1-115", "S1-092")
def test_one_request_paid_by_fifty_keys(world):
    """S1-003 "A payment request may move money at most once." 50 concurrent pays of one
    request, each with its own key: exactly one 201, the rest 409 request_not_pending."""
    rid = ok(world.bob.ask("ada", 100), 201)["request_id"]
    cs = pool(world, "ada", 50)
    try:
        out = burst(lambda i: cs[i].pay_request(rid), 50)
    finally:
        close_all(cs)
    codes = sorted(r.status_code for r in out)
    assert codes.count(201) == 1, codes
    for r in out:
        if r.status_code != 201:
            err(r, 409, "request_not_pending")
    assert world.ada.balance() == 9900 and world.bob.balance() == 2600
    assert len([p for p in world.ada.feed() if p["request_id"] == rid]) == 1


@pytest.mark.req("S1-003", "S1-038")
def test_pay_decline_and_cancel_race(world):
    """S1-038 "exactly one of `paid`, `declined` or `cancelled`" under a race: the final status
    matches the money moved."""
    for _ in range(5):
        rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
        a = pool(world, "ada", 10)
        b = pool(world, "bob", 5)
        try:
            def go(i):
                if i % 3 == 0:
                    return a[i % 10].pay_request(rid)
                if i % 3 == 1:
                    return a[i % 10].post(f"/requests/{rid}/decline")
                return b[i % 5].post(f"/requests/{rid}/cancel")
            out = burst(go, 30)
        finally:
            close_all(a + b)
        assert all(r.status_code in (200, 201, 409) for r in out)
        final = next(r for r in world.bob.requests_list() if r["request_id"] == rid)
        paid = [r for r in out if r.status_code == 201]
        assert (final["status"] == "paid") == (len(paid) == 1)
        assert len(paid) <= 1
        winners = {r.json()["status"] for r in out if r.status_code == 200}
        assert winners <= {final["status"]}, (winners, final["status"])
    conserve(world)


@pytest.mark.req("S1-001", "S1-002", "S1-180")
def test_settlements_and_payments_at_once(make_world):
    """S1-001/S1-002/S1-180: settlements that rely on incoming transfers race with direct
    payments draining the same wallets; nothing goes negative and the total holds."""
    fx = fixture(users=[user("op", 0), user("a", 200), user("b", 200), user("c", 200)],
                 operators=["u_op"])
    w = make_world(fx)
    ops = pool(w, "op", 20)
    pays = {h: pool(w, h, 10) for h in "abc"}

    def go(i):
        if i % 2:
            return ops[i % 20].settle([
                {"from_handle": "a", "to_handle": "b", "amount": 30},
                {"from_handle": "b", "to_handle": "c", "amount": 50},
                {"from_handle": "c", "to_handle": "a", "amount": 20}])
        h = "abc"[i % 3]
        return pays[h][i % 10].pay({"a": "b", "b": "c", "c": "a"}[h], 25)
    try:
        out = burst(go, 200)
    finally:
        close_all(ops)
        for v in pays.values():
            close_all(v)
    assert all(r.status_code in (201, 409) for r in out), {r.status_code for r in out}
    conserve(w)


@pytest.mark.req("S1-035", "S1-080", "S1-076", "S1-031")
def test_concurrent_signups_one_handle(world):
    """S1-031 handles are unique; S1-080: 30 concurrent signups deriving `twin` — exactly one
    account is created; the rest are 409 handle_taken (or email_taken for the same email)."""
    cs = [Api(world.ada.base_url) for _ in range(30)]
    try:
        out = burst(lambda i: cs[i].signup(f"twin@x{i % 15}.example"), 30)
    finally:
        close_all(cs)
    assert sum(r.status_code == 201 for r in out) == 1, [r.status_code for r in out]
    for r in out:
        if r.status_code != 201:
            assert r.status_code == 409
            assert r.json()["error"]["code"] in ("handle_taken", "email_taken")


@pytest.mark.req("S1-012", "S1-013", "S1-073")
def test_fifty_in_flight_on_a_large_state(make_world):
    """S1-012 "up to 50 in flight"; S1-013 "Per-request timeout | 5 s". After 3000 payments and
    600 requests, 50 clients mix feed reads, list reads, payments and requests; every call
    answers within 5 s (the client timeout)."""
    fx = fixture(users=[user(f"m{i}", 100000) for i in range(20)])
    w = make_world(fx)
    names = list(w.clients)
    cs = [Api(w.m0.base_url, w.clients[names[i % 20]].token) for i in range(50)]
    try:
        burst(lambda i: ok(cs[i % 50].pay(names[(i % 50 % 20 + 1 + i % 19) % 20], 1,
                                          note="x" * 200), 201), 3000)
        burst(lambda i: ok(cs[i % 50].ask(names[(i % 50 % 20 + 1) % 20], 5), 201), 600)
        worst = []

        def mixed(i):
            t0 = time.time()
            c = cs[i % 50]
            k = i % 4
            if k == 0:
                r = c.get("/activity", params={"limit": 200, "offset": i % 2000})
            elif k == 1:
                r = c.get("/requests", params={"limit": 200})
            elif k == 2:
                r = c.pay(names[(i % 50 % 20 + 1) % 20], 1)
            else:
                r = c.ask(names[(i % 50 % 20 + 2) % 20], 1)
            worst.append(time.time() - t0)
            assert r.status_code in (200, 201), r.text[:200]
        burst(mixed, 500)
    finally:
        close_all(cs)
    assert max(worst) < 5.0, max(worst)
    conserve(w)


@pytest.mark.req("S1-013", "S1-019", "S1-053")
def test_large_fixture_resets_within_10_seconds_and_logs_in(api, control):
    """S1-013 "10 s for `POST /_test/reset`"; S1-053 seeded users log in immediately. 100 users,
    2000 seeded payments and 500 seeded requests; then 50 concurrent logins within 5 s each."""
    users = [user(f"s{i}", 10000) for i in range(100)]
    payments = [{"id": f"p_{i}", "from_user_id": f"u_s{i % 100}",
                 "to_user_id": f"u_s{(i + 1) % 100}", "amount": 1, "note": "seed",
                 "visibility": "public" if i % 2 else "private"} for i in range(2000)]
    requests = [{"id": f"rq_{i}", "requester_id": f"u_s{i % 100}",
                 "payer_id": f"u_s{(i + 3) % 100}", "amount": 5, "note": "seed",
                 "status": "pending"} for i in range(500)]
    fx = fixture(users=users, payments=payments, requests=requests)
    t0 = time.time()
    ok(control.post("/_test/reset", fx), 204)
    assert time.time() - t0 < 10.0
    cs = [api() for _ in range(50)]
    out = burst(lambda i: cs[i].login(f"s{i}@example.com"), 50)
    for r in out:
        ok(r, 200)
    c = api(out[0].json()["token"])
    assert c.balance() == 10000
    body = ok(c.get("/activity", params={"limit": 200}), 200)
    assert body["has_more"] is True


@pytest.mark.req("S1-013", "S1-053", "S1-083")
def test_reset_of_1000_users_with_distinct_passwords_within_10_seconds(api, control):
    """S1-013 "10 s for `POST /_test/reset`" — the fixture format bounds no user count, so 1000
    users who each have their own password still reset within 10 s; each logs in with that
    password only, and the export holds no plaintext (S1-083)."""
    users = [user(f"d{i}", 1, password=f"pw-{i}-{new_key()[:6]}") for i in range(1000)]
    t0 = time.time()
    ok(control.post("/_test/reset", fixture(users=users)), 204)
    assert time.time() - t0 < 10.0, f"reset took {time.time() - t0:.2f}s"
    last = users[-1]
    ok(api().login(last["email"], last["password"]), 200)
    err(api().login(last["email"], users[0]["password"]), 401, "unauthenticated")
    text = control.get("/_test/export").text
    assert not any(u["password"] in text for u in users[::97])
