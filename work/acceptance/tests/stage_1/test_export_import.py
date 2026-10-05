"""Stage 1 §10 export and import (and §3.3 reset over imported state)."""
import copy
import json
import time

import pytest

from conftest import (Api, burst, conserve, err, fixture, new_key, ok, seeded_total, user,
                      PASSWORD)

TWO53 = 2 ** 53


def export(c):
    r = c.get("/_test/export", token=None)
    return ok(r, 200)


def do_import(c, body, expect=204):
    r = c.post("/_test/import", body, token=None)
    if expect is None:
        return r
    return ok(r, expect)


def state_view(w):
    """Everything a user can observe, per user."""
    out = {}
    for h, c in w.clients.items():
        out[h] = (c.me(), c.feed(), c.requests_list())
    return out


@pytest.fixture
def rich(make_world):
    """A world with every kind of record: direct payments (public/private), a paid, a declined,
    a cancelled and a pending request, a split, a settlement, a signed-up user, and one
    completed idempotent call on each path."""
    w = make_world(fixture(operators=["u_ada"]))
    keys = {}
    keys["payments"] = new_key()
    r_pay = ok(w.ada.pay("bob", 100, key=keys["payments"], note="é😀"), 201)
    ok(w.bob.pay("cy", 7, visibility="private"), 201)
    keys["requests"] = new_key()
    r_req = ok(w.bob.ask("ada", 30, key=keys["requests"]), 201)
    keys["pay"] = new_key()
    r_paid = ok(w.ada.pay_request(r_req["request_id"], {"visibility": "private"},
                                  key=keys["pay"]), 201)
    d = ok(w.cy.ask("ada", 5), 201)["request_id"]
    ok(w.ada.post(f"/requests/{d}/decline"), 200)
    c = ok(w.cy.ask("bob", 6), 201)["request_id"]
    ok(w.cy.post(f"/requests/{c}/cancel"), 200)
    w.pending = ok(w.dan.ask("cy", 900), 201)["request_id"]
    keys["splits"] = new_key()
    r_split = ok(w.ada.split(10, ["ada", "bob", "cy"], key=keys["splits"]), 201)
    keys["settlements"] = new_key()
    r_settle = ok(w.ada.settle([{"from_handle": "bob", "to_handle": "dan", "amount": 3},
                                {"from_handle": "dan", "to_handle": "cy", "amount": 2,
                                 "visibility": "private"}], key=keys["settlements"]), 201)
    w.signup_pw = "Signup-" + new_key()
    su = ok(w.ada.signup("eve.new@example.com", w.signup_pw, "Eve"), 201)
    w.eve = Api(w.ada.base_url, su["token"])
    w.failed_key = new_key()
    err(w.dan.pay("ada", 5, key=w.failed_key), 409, "insufficient_funds")
    w.keys = keys
    w.receipts = {"payments": r_pay, "requests": r_req, "pay": r_paid, "splits": r_split,
                  "settlements": r_settle}
    w.replays = {
        "payments": lambda c: c.ada.pay("bob", 100, key=keys["payments"], note="é😀"),
        "requests": lambda c: c.bob.ask("ada", 30, key=keys["requests"]),
        "pay": lambda c: c.ada.pay_request(r_req["request_id"], {"visibility": "private"},
                                           key=keys["pay"]),
        "splits": lambda c: c.ada.split(10, ["ada", "bob", "cy"], key=keys["splits"]),
        "settlements": lambda c: c.ada.settle(
            [{"from_handle": "bob", "to_handle": "dan", "amount": 3},
             {"from_handle": "dan", "to_handle": "cy", "amount": 2, "visibility": "private"}],
            key=keys["settlements"]),
    }
    yield w
    w.eve.close()


@pytest.mark.req("S1-152", "S1-153")
def test_export_shape_no_auth(rich, api):
    """S1-152 unauthenticated test endpoints; S1-153 "Return 200 from export with a JSON object
    containing `track: "pocketful"`, `format_version: 1` and `state`" """
    body = export(api())
    assert body["track"] == "pocketful"
    assert body["format_version"] == 1 and isinstance(body["format_version"], int)
    assert isinstance(body["state"], dict)
    ok(api("garbage").get("/_test/export"), 200)


@pytest.mark.req("S1-154", "S1-162", "S1-161")
def test_import_round_trip_restores_everything(rich, api, reset):
    """S1-154 "Import takes that entire object and atomically replaces the service's state,
    returning 204." S1-162 "Identities, timestamps and monetary records must not be
    regenerated or replayed against an already-net balance." """
    snap = export(api())
    before = state_view(rich)
    reset(fixture(users=[user("zz", 5)]))
    do_import(api(), snap)
    assert state_view(rich) == before


@pytest.mark.req("S1-161", "S1-164")
def test_tokens_and_logins_survive_import(rich, api, reset):
    """S1-161 "Preserve accounts and hashed-password login, existing bearer tokens";
    S1-164 "Existing receipts, tokens and retries must remain valid after import" """
    snap = export(api())
    reset(fixture(users=[user("zz", 5)]))
    do_import(api(), snap)
    for c in list(rich.clients.values()) + [rich.eve]:
        ok(c.get("/me"), 200)
    assert rich.eve.me()["handle"] == "eve_new"
    ok(api().login("eve.new@example.com", rich.signup_pw), 200)
    err(api().login("eve.new@example.com", PASSWORD), 401, "unauthenticated")
    ok(api().login("ada@example.com"), 200)
    err(api().login("zz@example.com"), 401, "unauthenticated")


@pytest.mark.req("S1-161", "S1-164", "S1-088")
@pytest.mark.parametrize("path", ["payments", "requests", "pay", "splits", "settlements"])
def test_retries_survive_import(rich, api, reset, path):
    """S1-161 "all completed idempotent request bodies and original responses"; S1-164 retries
    remain valid: replay is 200 with the original body, moves nothing; a changed body is 409."""
    snap = export(api())
    reset(fixture(users=[user("zz", 5)]))
    do_import(api(), snap)
    before = state_view(rich)
    assert ok(rich.replays[path](rich), 200) == rich.receipts[path]
    assert state_view(rich) == before
    k = rich.keys[path]
    changed = {"payments": lambda: rich.ada.pay("bob", 101, key=k),
               "requests": lambda: rich.bob.ask("ada", 31, key=k),
               "pay": lambda: rich.ada.pay_request(rich.receipts["requests"]["request_id"],
                                                   {}, key=k),
               "splits": lambda: rich.ada.split(11, ["ada", "bob", "cy"], key=k),
               "settlements": lambda: rich.ada.settle(
                   [{"from_handle": "bob", "to_handle": "dan", "amount": 4}], key=k)}[path]
    err(changed(), 409, "idempotency_key_reuse")


@pytest.mark.req("S1-163")
def test_failed_keys_stay_reusable(rich, api, reset):
    """S1-163 "Failed request keys remain reusable." """
    snap = export(api())
    reset(fixture(users=[user("zz", 5)]))
    do_import(api(), snap)
    ok(rich.ada.pay("dan", 1), 201)
    ok(rich.ada.pay("dan", 4), 201)
    ok(rich.dan.pay("ada", 5, key=rich.failed_key), 201)


@pytest.mark.req("S1-161", "S1-186", "S1-167")
def test_permissions_and_settlement_membership_survive(rich, api, reset):
    """S1-161 "permissions"; S1-186 "A reset/import must preserve settlement operator
    permissions, original payments, requests, settlement membership and retry responses." """
    snap = export(api())
    reset(fixture(users=[user("ada", 5), user("bob", 5)]))
    plain_ada = api(ok(api().login("ada@example.com"), 200)["token"])
    err(plain_ada.settle([{"from_handle": "bob", "to_handle": "ada", "amount": 1}]), 403,
        "forbidden")
    do_import(api(), snap)
    ok(rich.ada.settle([{"from_handle": "ada", "to_handle": "bob", "amount": 1}]), 201)
    err(rich.bob.settle([{"from_handle": "bob", "to_handle": "ada", "amount": 1}]), 403,
        "forbidden")
    sid = rich.receipts["settlements"]["settlement_id"]
    members = [x for x in rich.dan.feed() if x["settlement_id"] == sid]
    assert sorted(m["payment_id"] for m in members) == \
        sorted(p["payment_id"] for p in rich.receipts["settlements"]["payments"])


@pytest.mark.req("S1-161", "S1-028")
def test_currency_survives(make_world, api, reset):
    """S1-161 "currency": a JPY state imported over an EUR service is JPY again."""
    w = make_world(fixture(currency="JPY"))
    ok(w.ada.pay("bob", 3), 201)
    snap = export(api())
    reset(fixture(currency="BHD"))
    do_import(api(), snap)
    me = w.ada.me()
    assert me["currency"] == "JPY" and me["minor_units"] == 0 and me["balance"] == 9997


@pytest.mark.req("S1-161", "S1-041")
def test_pending_request_still_payable_after_import(rich, api, reset):
    """S1-161 "requests": a pending request stays pending and payable once funded."""
    snap = export(api())
    reset(fixture())
    do_import(api(), snap)
    err(rich.cy.pay_request(rich.pending), 409, "insufficient_funds")
    ok(rich.ada.pay("cy", 500), 201)
    p = ok(rich.cy.pay_request(rich.pending), 201)
    assert p["request_id"] == rich.pending


@pytest.mark.req("S1-156")
def test_import_twice_duplicates_nothing(rich, api):
    """S1-156 "Import is replacement, not merge; repeating it restores the exported state
    without duplicating anything." """
    snap = export(api())
    before = state_view(rich)
    do_import(api(), snap)
    do_import(api(), snap)
    assert state_view(rich) == before


@pytest.mark.req("S1-156", "S1-165", "S1-160")
def test_import_replaces_later_writes(rich, api):
    """S1-160 "subsequent source writes do not change it"; S1-165 "Import removes all previous
    destination data and credentials." Writes, a new account and a new token made after the
    export are gone after importing it."""
    snap = export(api())
    before = state_view(rich)
    ok(rich.ada.pay("bob", 1), 201)
    ok(rich.bob.ask("cy", 1), 201)
    late = ok(rich.ada.signup("late@example.com"), 201)["token"]
    fresh_ada = ok(api().login("ada@example.com"), 200)["token"]
    do_import(api(), snap)
    assert state_view(rich) == before
    err(api(late).get("/me"), 401, "unauthenticated")
    err(api().login("late@example.com"), 401, "unauthenticated")
    err(api(fresh_ada).get("/me"), 401, "unauthenticated")


@pytest.mark.req("S1-157")
@pytest.mark.parametrize("raw", ["{nope", "", '{"track": "pocketful",'])
def test_import_invalid_json(rich, api, raw):
    """S1-157 "Invalid JSON follows §5" — 400 `malformed_request`, destination unchanged."""
    before = state_view(rich)
    r = api().request("POST", "/_test/import", content=raw.encode(), token=None)
    err(r, 400, "malformed_request")
    assert state_view(rich) == before


@pytest.mark.req("S1-158")
@pytest.mark.parametrize("change", ["no_track", "no_version", "no_state", "empty",
                                    "track", "version2", "version0", "version_str",
                                    "state_str", "state_null", "state_list", "state_tampered"])
def test_import_invalid_document(rich, api, change):
    """S1-158 "missing fields, wrong track/version or an invalid state give 422
    `validation_failed` without changing the destination." """
    snap = export(api())
    doc = copy.deepcopy(snap)
    if change == "no_track":
        del doc["track"]
    elif change == "no_version":
        del doc["format_version"]
    elif change == "no_state":
        del doc["state"]
    elif change == "empty":
        doc = {}
    elif change == "track":
        doc["track"] = "other"
    elif change == "version2":
        doc["format_version"] = 2
    elif change == "version0":
        doc["format_version"] = 0
    elif change == "version_str":
        doc["format_version"] = "1"
    elif change == "state_str":
        doc["state"] = "x"
    elif change == "state_null":
        doc["state"] = None
    elif change == "state_list":
        doc["state"] = []
    elif change == "state_tampered":
        assert doc["state"], "export state has content"
        doc["state"] = {k: "x" for k in doc["state"]}
    ok(rich.ada.pay("bob", 1), 201)
    before = state_view(rich)
    r = do_import(api(), doc, expect=None)
    err(r, 422, "validation_failed")
    assert state_view(rich) == before
    ok(rich.ada.pay("bob", 1), 201)


@pytest.mark.req("S1-158", "S1-051")
def test_import_with_an_amount_above_two_to_the_53_is_refused_or_exact(make_world, api):
    """S1-158 an invalid state is 422. Only meaningful if the state shows balances as plain
    JSON numbers: a balance pushed past 2^53 is not a state this service can produce."""
    w = make_world(fixture(users=[user("ada", 123456789), user("bob", 1)]))
    snap = export(api())
    text = json.dumps(snap)
    if "123456789" not in text:
        pytest.skip("state does not show the balance as a plain number")
    bad = json.loads(text.replace("123456789", str(TWO53 * 4 + 1)))
    before = state_view(w)
    r = do_import(api(), bad, expect=None)
    err(r, 422, "validation_failed")
    assert state_view(w) == before


@pytest.mark.req("S1-051", "S1-161")
def test_values_near_two_to_the_53_round_trip(make_world, api, reset):
    """S1-051 exact values; S1-161 balances preserved — balances near 2^53 survive export
    and import exactly (the seeded total stays within 2^53 too)."""
    big = TWO53 - 3_000_000_001
    w = make_world(fixture(users=[user("ada", big), user("bob", 3_000_000_000),
                                  user("cy", 1)]))
    ok(w.ada.pay("cy", 999_999_999), 201)
    snap = export(api())
    reset(fixture())
    do_import(api(), snap)
    assert w.ada.balance() == big - 999_999_999
    assert w.bob.balance() == 3_000_000_000
    assert w.cy.balance() == 1_000_000_000


@pytest.mark.req("S1-166", "S1-020")
def test_reset_clears_imported_state(rich, api, reset):
    """S1-166 "Reset clears all state, including imported state." """
    snap = export(api())
    reset(fixture(users=[user("zz", 5)]))
    do_import(api(), snap)
    reset(fixture(users=[user("ada", 1), user("bob", 2)]))
    err(rich.ada.get("/me"), 401, "unauthenticated")
    err(rich.eve.get("/me"), 401, "unauthenticated")
    c = api()
    c.token = ok(c.login("ada@example.com"), 200)["token"]
    assert c.balance() == 1 and c.feed() == [] and c.requests_list() == []
    ok(c.pay("bob", 1, key=rich.keys["payments"]), 201)


@pytest.mark.docker
@pytest.mark.req("S1-155", "S1-161", "S1-164")
def test_import_into_another_container(rich, api, spawn):
    """S1-155 "No dependency on the source process, files, volume, port or network address is
    allowed." The export is imported into a fresh second container of the same image; tokens,
    logins, replays and balances work there."""
    snap = export(api())
    before = state_view(rich)
    url = spawn()
    other = Api(url)
    try:
        do_import(other, snap)
        moved = {h: Api(url, c.token) for h, c in rich.clients.items()}
        view = {h: (c.me(), c.feed(), c.requests_list()) for h, c in moved.items()}
        assert view == before
        ok(other.login("eve.new@example.com", rich.signup_pw), 200)
        assert ok(moved["ada"].pay("bob", 100, key=rich.keys["payments"], note="é😀"),
                  200) == rich.receipts["payments"]
        for c in moved.values():
            c.close()
    finally:
        other.close()


@pytest.mark.req("S1-159", "S1-013")
def test_large_export_and_import_within_10_seconds(make_world, api, reset):
    """S1-159 "Test control calls have a 10-second timeout." An export above 1 MiB (900 payments
    with 200-emoji notes) exports and imports back within the limit, unchanged."""
    w = make_world(fixture(users=[user("ada", 10 ** 9), user("bob", 0)]))
    clients = [Api(w.ada.base_url, w.ada.token) for _ in range(20)]
    try:
        burst(lambda i: ok(clients[i % 20].pay("bob", 1, note="😀" * 200), 201), 900,
              workers=20)
    finally:
        for c in clients:
            c.close()
    t0 = time.time()
    r = api().get("/_test/export", token=None)
    snap = ok(r, 200)
    assert time.time() - t0 < 10
    assert len(r.content) > 1024 * 1024, f"export only {len(r.content)} bytes"
    reset(fixture())
    t0 = time.time()
    do_import(api(), snap)
    assert time.time() - t0 < 10
    assert w.ada.balance() == 10 ** 9 - 900 and w.bob.balance() == 900
    body = ok(w.bob.get("/activity", params={"limit": 200, "offset": 800}), 200)
    assert len(body["payments"]) == 100


@pytest.mark.req("S1-160", "S1-001", "S1-002")
def test_export_is_an_atomic_snapshot_under_writes(make_world, api, reset):
    """S1-160 "Export is an atomic, read-only snapshot" — exports taken while 50 clients move
    money each import to a state whose balances sum to the seeded total, none negative."""
    fx = fixture(users=[user(f"u{i}", 1000) for i in range(10)])
    w = make_world(fx)
    names = list(w.clients)
    clients = [Api(w.u0.base_url, w.clients[names[i % 10]].token) for i in range(40)]
    snaps = []

    def work(i):
        if i % 10 == 9:
            snaps.append(ok(api().get("/_test/export", token=None), 200))
        else:
            sender = i % 40 % 10          # clients[k] is user names[k % 10]
            to = (sender + 1 + i % 9) % 10
            clients[i % 40].pay(names[to], 1 + i % 300)
    try:
        burst(work, 400, workers=50)
    finally:
        for c in clients:
            c.close()
    assert snaps
    for snap in snaps[:5]:
        do_import(api(), snap)
        balances = [c.balance() for c in w.clients.values()]
        assert sum(balances) == seeded_total(fx) and min(balances) >= 0, balances
