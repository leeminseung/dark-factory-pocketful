"""Stage 3: payment timestamps, GET /me?as_of, GET /statement (no corrections)."""
from datetime import timedelta

import pytest

from conftest import (Api, assert_timestamp, err, fixture, new_key, ok, seeded_total, ts,
                      user)
from s3 import (ago, at, before, full_statement, later, me_at, pay_rec, statement)

T1, T2, T3 = ago(hours=3), ago(hours=2), ago(hours=1)


def hist_fixture(**kw):
    """ada 10000, bob 2500, cy 500, dan 0 after: p_1 ada->bob 500 @T1, p_2 bob->ada 200 @T2,
    p_a ada->cy 30 @T3, p_b cy->bob 50 @T3 (a tie broken by id)."""
    return fixture(payments=[pay_rec("p_1", "ada", "bob", 500, T1, note="one"),
                             pay_rec("p_2", "bob", "ada", 200, T2, visibility="private"),
                             pay_rec("p_b", "cy", "bob", 50, T3),
                             pay_rec("p_a", "ada", "cy", 30, T3)], **kw)


OPEN = {"ada": 10330, "bob": 2150, "cy": 520, "dan": 0}


@pytest.fixture
def h(make_world):
    return make_world(hist_fixture())


# ---- payment timestamps ------------------------------------------------------------------

@pytest.mark.req("S3-004", "S3-022")
def test_seeded_created_at_is_kept(h):
    """S3-004 "Seeded payments may supply `created_at`" — served as the same instant."""
    feed = {p["payment_id"]: p for p in h.ada.feed()}
    assert ts(feed["p_1"]["created_at"]) == ts(at(T1))
    assert ts(feed["p_2"]["created_at"]) == ts(at(T2))
    for p in feed.values():
        assert_timestamp(p["created_at"])


@pytest.mark.req("S3-004")
def test_seeded_without_created_at_uses_reset_time(api, reset):
    """S3-004 "omission uses reset time, before subsequent API-created payments." """
    from datetime import datetime, timezone
    t0 = datetime.now(timezone.utc)
    reset(fixture(payments=[pay_rec("p_x", "ada", "bob", 5)]))
    t1 = datetime.now(timezone.utc)
    ada = api(ok(api().login("ada@example.com"), 200)["token"])
    new = ok(ada.pay("bob", 1), 201)
    seeded = next(p for p in ada.feed() if p["payment_id"] == "p_x")
    st = ts(seeded["created_at"])
    assert t0 - timedelta(seconds=2) <= st <= t1 + timedelta(seconds=2), seeded["created_at"]
    assert st <= ts(new["created_at"])
    assert [p["payment_id"] for p in ada.feed()] == [new["payment_id"], "p_x"]


@pytest.mark.req("S3-005")
@pytest.mark.parametrize("delta", [timedelta(hours=1), timedelta(days=400), timedelta(seconds=90)])
def test_future_seeded_created_at_is_a_reset_error(world, reset, delta):
    """S3-005 "A seeded `created_at` in the future gives `422 validation_failed` ... with no state
    change." """
    from datetime import datetime, timezone
    ok(world.ada.pay("bob", 10), 201)
    fx = fixture(payments=[pay_rec("p_f", "ada", "bob", 5, datetime.now(timezone.utc) + delta)])
    err(reset(fx, expect=None), 422, "validation_failed")
    assert world.ada.balance() == 9990 and len(world.ada.feed()) == 1


@pytest.mark.req("S3-005", "S1-065")
@pytest.mark.parametrize("bad", ["yesterday", "2026-09-24", "2026-09-24T10:00:00", "", 5,
                                 "2026-02-30T10:00:00+00:00"])
def test_invalid_seeded_created_at_is_a_reset_error(world, reset, bad):
    """S3-005 / decision D3: a seeded `created_at` must be an RFC 3339 instant."""
    fx = fixture(payments=[pay_rec("p_f", "ada", "bob", 5, bad)])
    r = reset(fx, expect=None)
    assert r.status_code in (400, 422), r.text
    assert world.ada.balance() == 10000


@pytest.mark.req("S3-006", "S3-023")
def test_seeded_balances_are_final(h):
    """S3-006 "A fixture's `balance` remains the balance after all seeded payments." """
    for name, bal in (("ada", 10000), ("bob", 2500), ("cy", 500), ("dan", 0)):
        assert h.clients[name].balance() == bal


@pytest.mark.req("S3-002")
def test_every_payment_carries_created_at(make_world):
    """S3-002 "Every endpoint returning a payment includes it." — direct, request pay,
    settlement members, capture, feed, statement entries."""
    from s2 import authorize, capture
    w = make_world(fixture(operators=["u_ada"]))
    out = [ok(w.ada.pay("bob", 1), 201)]
    rid = ok(w.bob.ask("ada", 1), 201)["request_id"]
    out.append(ok(w.ada.pay_request(rid), 201))
    out += ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 1}]), 201)["payments"]
    aid = ok(authorize(w.ada, "bob", 5), 201)["authorization_id"]
    out.append(ok(capture(w.bob, aid), 201))
    out += w.ada.feed()
    out += [e["payment"] for e in statement(w.ada)["entries"]]
    for p in out:
        assert_timestamp(p["created_at"])


@pytest.mark.req("S3-003")
def test_activity_ordering_with_seeded_times(h):
    """S3-003 "`GET /activity` retains its existing ordering by this field." — API payments
    after the seeded past ones, all newest first."""
    new = ok(h.ada.pay("bob", 1), 201)
    feed = h.ada.feed()
    assert ts(next(p for p in feed if p["payment_id"] == "p_1")["created_at"]) == ts(at(T1))
    order = [p["payment_id"] for p in feed]
    assert order[0] == new["payment_id"]
    assert order.index("p_2") > order.index("p_a") and order.index("p_1") > order.index("p_2")


# ---- GET /me?as_of -------------------------------------------------------------------------

@pytest.mark.req("S3-007")
@pytest.mark.parametrize("bad", ["2026-09-24T13:20:00", "2026-09-24", "", "now", "13:20:00Z",
                                 "2026-02-30T00:00:00Z", "2026-09-24T25:00:00Z", "1790000000"])
def test_as_of_must_be_an_instant(h, bad):
    """S3-007 "Anything else — a naive local time, a bare date, an empty value — is 422" """
    err(h.ada.get("/me", params={"as_of": bad}), 422, "validation_failed")


@pytest.mark.req("S3-008")
def test_me_without_as_of(h):
    """S3-008 "Without temporal query parameters the response retains the existing money
    fields" — no `as_of` field echoed."""
    m = ok(h.ada.get("/me"), 200)
    assert "as_of" not in m and m["balance"] == 10000 and m["total"] == 10000


@pytest.mark.req("S3-009", "S3-012")
def test_as_of_is_inclusive(h):
    """S3-009 "A payment made at exactly `as_of` counts as having happened." """
    assert me_at(h.ada, at(T1 - timedelta(milliseconds=1)))["balance"] == 10330
    assert me_at(h.ada, at(T1))["balance"] == 9830
    assert me_at(h.ada, at(T1 + timedelta(minutes=30)))["balance"] == 9830
    assert me_at(h.ada, at(T2))["balance"] == 10030
    assert me_at(h.ada, at(T3 - timedelta(milliseconds=1)))["balance"] == 10030
    assert me_at(h.ada, at(T3))["balance"] == 10000
    assert me_at(h.cy, at(T3))["balance"] == 500
    assert me_at(h.bob, at(T2))["balance"] == 2450


@pytest.mark.req("S3-009", "S3-012")
@pytest.mark.parametrize("fmt", ["plus2", "z", "minus5"])
def test_as_of_in_other_offsets(h, fmt):
    """S3-009 with an instant written in another offset; S3-012 "carries `as_of` back, exactly
    as given." """
    from datetime import timezone
    tz = {"plus2": timezone(timedelta(hours=2)), "z": timezone.utc,
          "minus5": timezone(timedelta(hours=-5))}[fmt]
    s = T1.astimezone(tz).isoformat(timespec="milliseconds")
    if fmt == "z":
        s = s.replace("+00:00", "Z")
    m = me_at(h.ada, s)
    assert m["balance"] == 9830 and m["as_of"] == s


@pytest.mark.req("S3-010")
@pytest.mark.parametrize("offset", [timedelta(seconds=1), timedelta(days=1), timedelta(days=3650)])
def test_as_of_after_latest_is_current(h, offset):
    """S3-010 "An `as_of` at or after the latest payment returns the current balance." """
    from datetime import datetime, timezone
    ok(h.ada.pay("bob", 7), 201)
    s = at(datetime.now(timezone.utc) + offset)
    m = me_at(h.ada, s)
    assert m["balance"] == 9993 and m["as_of"] == s


@pytest.mark.req("S3-011", "S3-023")
def test_as_of_before_earliest_is_opening(h, api):
    """S3-011 "An `as_of` before the earliest payment returns the opening balance"; S3-023
    "New accounts open at zero." """
    for name, bal in OPEN.items():
        assert me_at(h.clients[name], at(T1 - timedelta(days=30)))["balance"] == bal
    new = api(ok(h.ada.signup("fresh@example.com"), 201)["token"])
    ok(h.ada.pay("fresh", 40), 201)
    assert me_at(new, at(T1))["balance"] == 0
    assert me_at(new, "1970-01-01T00:00:00Z")["balance"] == 0


@pytest.mark.req("S3-037", "S3-009")
def test_historical_views_sum_to_the_seed(h):
    """S3-037 "The sum of balances must equal the seeded total in every historical view." """
    total = seeded_total(h.fixture)
    assert me_at(h.ada, at(T1 - timedelta(hours=1)))["balance"] == 10330   # a real past view
    for t in (T1 - timedelta(hours=1), T1, T2, T3, T3 + timedelta(minutes=1)):
        assert sum(me_at(c, at(t))["balance"] for c in h.clients.values()) == total, t


@pytest.mark.req("S3-007", "S1-061")
def test_as_of_needs_auth(h):
    err(h.ada.get("/me", params={"as_of": at(T1)}, token=None), 401, "unauthenticated")


# ---- GET /statement --------------------------------------------------------------------------

@pytest.mark.req("S3-013", "S3-015", "S3-018")
def test_statement_defaults(h):
    """S3-013 `from` defaults to the opening of the wallet and `to` to now; S3-015 the shape;
    S3-018 deltas and closing."""
    s = statement(h.ada)
    assert set(s) >= {"opening_balance", "entries", "closing_balance", "has_more"}
    assert s["opening_balance"] == 10330 and s["closing_balance"] == 10000
    assert [e["payment"]["payment_id"] for e in s["entries"]] == ["p_1", "p_2", "p_a"]
    assert [e["delta"] for e in s["entries"]] == [-500, 200, -30]
    assert [e["balance_after"] for e in s["entries"]] == [9830, 10030, 10000]
    assert s["has_more"] is False
    for e in s["entries"]:
        assert set(e) >= {"payment", "delta", "balance_after"}
        assert e["payment"]["amount"] == abs(e["delta"])


@pytest.mark.req("S3-015", "S3-017")
def test_half_open_window(h):
    """S3-015 "the half-open window `[from, to)`"; S3-017 opening before `from`, closing before
    `to`."""
    s = statement(h.ada, **{"from": at(T1), "to": at(T2)})
    assert [e["payment"]["payment_id"] for e in s["entries"]] == ["p_1"]
    assert s["opening_balance"] == 10330 and s["closing_balance"] == 9830
    s = statement(h.ada, **{"from": at(T2), "to": at(T3 + timedelta(milliseconds=1))})
    assert [e["payment"]["payment_id"] for e in s["entries"]] == ["p_2", "p_a"]
    assert s["opening_balance"] == 9830 and s["closing_balance"] == 10000
    s = statement(h.ada, **{"from": at(T1 + timedelta(milliseconds=1)), "to": at(T2)})
    assert s["entries"] == [] and s["opening_balance"] == s["closing_balance"] == 9830


@pytest.mark.req("S3-016")
def test_ties_broken_by_payment_id(h):
    """S3-016 "Entries are ordered by `created_at` ascending, then payment `id` ascending for
    ties." — p_a and p_b share T3."""
    s = statement(h.cy)
    assert [e["payment"]["payment_id"] for e in s["entries"]] == ["p_a", "p_b"]
    assert [e["balance_after"] for e in s["entries"]] == [550, 500]
    assert s["opening_balance"] == 520


@pytest.mark.req("S3-018", "S3-019", "S3-014")
def test_paging_keeps_window_balances(h):
    """S3-019 "Pagination must not change an entry's `balance_after` or the window's opening and
    closing balances." """
    full = statement(h.ada)
    for off in range(0, 4):
        page = statement(h.ada, limit=1, offset=off)
        assert page["opening_balance"] == 10330 and page["closing_balance"] == 10000
        assert page["entries"] == full["entries"][off:off + 1]
        assert page["has_more"] is (off + 1 < 3)
    page = statement(h.ada, limit=2, offset=1)
    assert [e["balance_after"] for e in page["entries"]] == [10030, 10000]


@pytest.mark.req("S3-020")
def test_statement_has_only_own_payments(h):
    """S3-020 "Only payments sent or received by the caller appear ... including when other
    payments are public." """
    ok(h.bob.pay("cy", 3, visibility="public"), 201)
    ids = [e["payment"]["payment_id"] for e in statement(h.ada)["entries"]]
    assert "p_b" not in ids and len(ids) == 3
    assert statement(h.dan)["entries"] == []
    assert statement(h.dan)["opening_balance"] == 0


@pytest.mark.req("S3-018")
def test_new_payments_join_the_statement(h):
    """S3-018 with API payments: sent negative, received positive, arithmetic closes."""
    ok(h.ada.pay("bob", 100), 201)
    ok(h.cy.pay("ada", 40), 201)
    s = statement(h.ada)
    assert [e["delta"] for e in s["entries"]][-2:] == [-100, 40]
    assert s["opening_balance"] + sum(e["delta"] for e in s["entries"]) == s["closing_balance"]
    assert s["closing_balance"] == h.ada.balance() == 9940


@pytest.mark.req("S3-014", "S3-021")
@pytest.mark.parametrize("params", [{"limit": "0"}, {"limit": "201"}, {"offset": "-1"},
                                    {"limit": "1e1"}, {"from": "2026-09-24"},
                                    {"to": "2026-09-24T10:00:00"}, {"from": ""}, {"to": "x"}])
def test_statement_bad_params(h, params):
    """S3-014 limit/offset as on /requests; S3-021 (D3-1) window instants must be RFC 3339."""
    err(h.ada.get("/statement", params=params), 422, "validation_failed")


@pytest.mark.req("S3-015", "S1-061")
def test_statement_needs_auth(h):
    err(h.ada.get("/statement", token=None), 401, "unauthenticated")


@pytest.mark.req("S3-019", "S3-049")
def test_statement_past_200_entries(make_world):
    """S3-019 / S3-049 over several pages: balances per entry and per window are the full
    window's, and the pages join into one unbroken running balance."""
    from conftest import burst
    w = make_world(fixture(users=[user("ada", 100000), user("bob", 0)]))
    cs = [Api(w.ada.base_url, w.ada.token) for _ in range(10)]
    burst(lambda i: ok(cs[i % 10].pay("bob", 1 + i % 7), 201), 230, workers=10)
    first, entries = full_statement(w.ada)
    assert len(entries) == 230
    run = first["opening_balance"]
    for e in entries:
        run += e["delta"]
        assert e["balance_after"] == run
    assert run == first["closing_balance"] == w.ada.balance()
    key = [(ts(e["payment"]["created_at"]), e["payment"]["payment_id"]) for e in entries]
    assert key == sorted(key)
