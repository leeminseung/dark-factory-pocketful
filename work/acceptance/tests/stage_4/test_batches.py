"""Stage 4: correction batches."""
from datetime import timedelta, timezone

import pytest

from conftest import (Api, assert_timestamp, burst, err, err_any, fixture, new_key, ok, ts,
                      user)
from s2 import authorize, capture, fixture2, me
from s3 import ago, at, correct, full_statement, later, me_at, pay_rec, revisions, statement
from s4 import batch, item, refund


@pytest.fixture
def w(make_world):
    """ada operator 10000, bob 2500, cy 500, dan 0."""
    return make_world(fixture2(operators=["u_ada"]))


@pytest.fixture
def settled(w):
    w.s = ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 300},
                           {"from_handle": "cy", "to_handle": "dan", "amount": 100}]), 201)
    w.m1, w.m2 = w.s["payments"]
    return w


def members(w, amount1=0, amount2=0, eff1=None, eff2=None):
    eff = w.s["committed_at"]
    return [item(w.m1, 1, amount1, eff1 or eff), item(w.m2, 1, amount2, eff2 or eff)]


# ---- happy path and shape ---------------------------------------------------------------------

@pytest.mark.req("S4-029", "S4-020")
def test_batch_shape(w):
    """S4-029 "Return 201 with `correction_batch_id`, `recorded_at` and `revisions` in input
    order. All new revisions share recorded_at, strictly later than the previous recorded_at of
    every member; each revision also exposes correction_batch_id." S4-020 / D4-4 the operator
    corrects a payment between other wallets too."""
    p = ok(w.ada.pay("bob", 1000), 201)
    q = ok(w.cy.pay("dan", 200), 201)
    ok(correct(w.cy, q["payment_id"], 1, 150, q["created_at"]), 201)
    q_prev = revisions(w.cy, q["payment_id"])[-1]["recorded_at"]
    b = ok(batch(w.ada, [item(q, 2, 100, reason="dan side"), item(p, 1, 900, reason="ada side")]), 201)
    assert b["correction_batch_id"] and isinstance(b["correction_batch_id"], str)
    assert_timestamp(b["recorded_at"])
    revs = b["revisions"]
    assert [r["payment_id"] for r in revs] == [q["payment_id"], p["payment_id"]]
    assert [(r["revision"], r["amount"], r["reason"]) for r in revs] == \
        [(3, 100, "dan side"), (2, 900, "ada side")]
    for r in revs:
        assert r["correction_batch_id"] == b["correction_batch_id"]
        assert ts(r["recorded_at"]) == ts(b["recorded_at"])
    assert ts(b["recorded_at"]) > ts(q_prev) and ts(b["recorded_at"]) > ts(p["created_at"])
    assert (w.ada.balance(), w.bob.balance(), w.cy.balance(), w.dan.balance()) == \
        (9100, 3400, 400, 100)
    stored = revisions(w.dan, q["payment_id"])[-1]
    assert stored["correction_batch_id"] == b["correction_batch_id"]
    assert ts(stored["recorded_at"]) == ts(b["recorded_at"])


@pytest.mark.req("S4-016", "S4-002")
def test_batch_access(w):
    """S4-016 "requires a settlement operator and an idempotency key, with the same 401/403 rules
    as settlements." """
    p = ok(w.bob.pay("ada", 100), 201)
    err(batch(w.bob, [item(p, 1, 50)]), 403, "forbidden")
    err(w.ada.post("/correction-batches", {"corrections": [item(p, 1, 50)]}, key=new_key(),
                   token=None), 401, "unauthenticated")
    err(w.ada.post("/correction-batches", {"corrections": [item(p, 1, 50)]}), 400,
        "missing_idempotency_key")
    assert len(revisions(w.bob, p["payment_id"])) == 1


@pytest.mark.req("S4-017")
@pytest.mark.parametrize("shape", ["empty", "33", "dup", "string", "object", "null", "entry_str",
                                   "missing"])
def test_batch_shape_errors(w, shape):
    """S4-017 "corrections contains 1..32 objects with distinct payment_ids, else 422" """
    ps = [ok(w.ada.pay("bob", 1), 201) for _ in range(33 if shape == "33" else 2)]
    body = {"empty": [], "33": [item(p, 1, 0) for p in ps], "dup": [item(ps[0], 1, 0), item(ps[0], 1, 1)],
            "string": "p_x", "object": item(ps[0], 1, 0), "null": None, "entry_str": ["p_x"]}
    if shape == "missing":
        r = w.ada.post("/correction-batches", {}, key=new_key())
    else:
        r = w.ada.post("/correction-batches", {"corrections": body[shape]}, key=new_key())
    err(r, 422, "validation_failed")


@pytest.mark.req("S4-017")
def test_batch_of_32(w):
    """S4-017 32 corrections is within the limit."""
    ps = [ok(w.ada.pay("bob", 2), 201) for _ in range(32)]
    b = ok(batch(w.ada, [item(p, 1, 1) for p in ps]), 201)
    assert len(b["revisions"]) == 32 and w.ada.balance() == 10000 - 32


@pytest.mark.req("S4-018", "S4-030")
@pytest.mark.parametrize("field,value", [("expected_revision", 0), ("amount", -1),
                                         ("amount", 10 ** 9 + 1), ("amount", "5"), ("reason", ""),
                                         ("reason", "x" * 201), ("effective_at", "2026-09-24"),
                                         ("effective_at", "FUTURE"), ("__drop__", "reason"),
                                         ("__drop__", "effective_at"), ("__drop__", "amount"),
                                         ("__drop__", "expected_revision"), ("__drop__", "payment_id")])
def test_batch_item_validation(w, field, value):
    """S4-018 "Every item has the ordinary correction fields and validation." S4-030 "Effective
    times cannot be later than now." """
    p = ok(w.ada.pay("bob", 100), 201)
    it = item(p, 1, 50)
    if field == "__drop__":
        del it[value]
    else:
        it[field] = later(p["created_at"], hours=1) if value == "FUTURE" else value
    err(batch(w.ada, [it]), 422, "validation_failed")
    assert len(revisions(w.ada, p["payment_id"])) == 1


@pytest.mark.req("S4-018")
@pytest.mark.parametrize("field,value", [("expected_revision", "1"), ("reason", 5),
                                         ("effective_at", None), ("payment_id", 5)])
def test_batch_item_wrong_types(w, field, value):
    """S4-018 / D4-6 wrong JSON types in an item: 400 or 422."""
    p = ok(w.ada.pay("bob", 100), 201)
    it = item(p, 1, 50)
    it[field] = value
    err_any(batch(w.ada, [it]), {(400, "malformed_request"), (422, "validation_failed")})


@pytest.mark.req("S4-019")
def test_batch_unknown_and_stale(w):
    """S4-019 "Unknown payment is 404; a stale expected revision is 409 `stale_revision`." """
    p = ok(w.ada.pay("bob", 100), 201)
    err(batch(w.ada, [item("p_nope", 1, 0, p["created_at"])]), 404, "not_found")
    err(batch(w.ada, [item(p, 2, 0)]), 409, "stale_revision")
    ok(correct(w.ada, p["payment_id"], 1, 90, p["created_at"]), 201)
    err(batch(w.ada, [item(p, 1, 0)]), 409, "stale_revision")
    ok(batch(w.ada, [item(p, 2, 80)]), 201)


@pytest.mark.req("S4-021")
def test_batch_cannot_touch_captures_or_refunds(w):
    """S4-021 "captures and refunds remain immutable." """
    aid = ok(authorize(w.ada, "bob", 500), 201)["authorization_id"]
    cp = ok(capture(w.bob, aid, {"amount": 100}), 201)
    p = ok(w.ada.pay("bob", 1000), 201)
    r = ok(refund(w.bob, p["payment_id"], 100), 201)
    err(batch(w.ada, [item(cp, 1, 50)]), 422, "linked_payment_immutable")
    err(batch(w.ada, [item(p, 1, 900), item(r, 1, 50)]), 422, "linked_payment_immutable")
    assert len(revisions(w.ada, p["payment_id"])) == 1


@pytest.mark.req("S4-020", "S4-022")
def test_settlement_correction_needs_every_member(settled):
    """S4-022 "Correcting any settlement member requires including every member of that
    settlement, else 422 `incomplete_settlement`." """
    w = settled
    err(batch(w.ada, [item(w.m1, 1, 0, w.s["committed_at"])]), 422, "incomplete_settlement")
    err(batch(w.ada, [item(w.m2, 1, 50, w.s["committed_at"])]), 422, "incomplete_settlement")
    b = ok(batch(w.ada, members(w, 0, 0)), 201)
    assert len(b["revisions"]) == 2
    assert (w.bob.balance(), w.cy.balance(), w.dan.balance()) == (2500, 500, 0)


@pytest.mark.req("S4-023")
def test_members_share_one_effective_instant(settled):
    """S4-023 "Members of one settlement must have identical effective instants (offset
    spellings may differ), else 422 `validation_failed`." """
    w = settled
    other = later(w.s["committed_at"], milliseconds=1)
    err(batch(w.ada, members(w, 0, 0, eff2=other)), 422, "validation_failed")
    plus9 = ts(w.s["committed_at"]).astimezone(timezone(timedelta(hours=9))).isoformat(
        timespec="milliseconds")
    ok(batch(w.ada, members(w, 200, 50, eff1=w.s["committed_at"], eff2=plus9)), 201)


@pytest.mark.req("S4-024", "S3-054")
def test_single_corrections_and_members(settled):
    """S4-024 "Ordinary single-payment corrections remain available for nonmembers." Members
    stay `linked_payment_immutable` for single corrections (D4-5)."""
    w = settled
    err(correct(w.bob, w.m1["payment_id"], 1, 1, w.s["committed_at"]), 422, "linked_payment_immutable")
    p = ok(w.bob.pay("ada", 10), 201)
    ok(correct(w.bob, p["payment_id"], 1, 5, p["created_at"]), 201)


@pytest.mark.req("S4-025")
def test_batch_unknown_fields_ignored(w):
    """S4-025 "Unknown fields are ignored." """
    p = ok(w.ada.pay("bob", 100), 201)
    ok(batch(w.ada, [item(p, 1, 90, colour="x", to_handle="cy")], dry_run=True), 201)
    assert w.cy.balance() == 500 and w.bob.balance() == 2590


# ---- precedence ---------------------------------------------------------------------------------

@pytest.mark.req("S4-026")
def test_item_errors_in_input_order(w):
    """S4-026 "item errors in input order" """
    p = ok(w.ada.pay("bob", 100), 201)
    aid = ok(authorize(w.ada, "bob", 50), 201)["authorization_id"]
    cp = ok(capture(w.bob, aid), 201)
    unknown = item("p_nope", 1, 0, p["created_at"])
    stale = item(p, 7, 0)
    bad = item(p, 1, -1)
    linked = item(cp, 1, 0)
    err(batch(w.ada, [unknown, item(cp, 1, 0)]), 404, "not_found")
    err(batch(w.ada, [stale, unknown]), 409, "stale_revision")
    err(batch(w.ada, [linked, stale]), 422, "linked_payment_immutable")
    err(batch(w.ada, [bad, unknown]), 422, "validation_failed")


@pytest.mark.req("S4-026", "S4-022")
def test_item_errors_before_completeness(settled):
    """S4-026 item errors come before settlement completeness."""
    w = settled
    err(batch(w.ada, [item(w.m1, 1, -1, w.s["committed_at"])]), 422, "validation_failed")
    err(batch(w.ada, [item(w.m1, 3, 0, w.s["committed_at"])]), 409, "stale_revision")


@pytest.mark.req("S4-026", "S4-022")
def test_completeness_before_funds(settled):
    """S4-026 settlement completeness before current available funds: m1 alone, raised beyond
    bob's funds, is `incomplete_settlement`."""
    w = settled
    err(batch(w.ada, [item(w.m1, 1, 10 ** 9, w.s["committed_at"])]), 422, "incomplete_settlement")


@pytest.mark.req("S4-026", "S4-027")
def test_funds_before_history(make_world):
    """S4-026 "resulting current available funds, then historical total and available funds" —
    a batch both unaffordable now and a historical overdraft is `insufficient_funds`; one that is
    affordable now but overdraws history is `historical_overdraft`."""
    T1, T2, T3 = ago(hours=3), ago(hours=2), ago(hours=1)
    w = make_world(fixture2(operators=["u_ada"],
                            users=[user("ada", 9000), user("bob", 600), user("cy", 1000), user("dan", 0)],
                            payments=[pay_rec("p_1", "ada", "bob", 1000, T1),
                                      pay_rec("p_2", "bob", "cy", 1000, T2),
                                      pay_rec("p_3", "dan", "bob", 600, T3)]))
    err(batch(w.ada, [item("p_1", 1, 0, at(T1))]), 409, "insufficient_funds")
    err(batch(w.ada, [item("p_1", 1, 500, at(T1))]), 409, "historical_overdraft")
    assert w.bob.balance() == 600


@pytest.mark.req("S4-027")
def test_combined_affordability(make_world):
    """S4-027 "Affordability is determined by the combined effect of all proposed revisions." —
    each correction alone overdraws bob; together they net to zero."""
    T1, T2 = ago(hours=2), ago(hours=1)
    w = make_world(fixture2(operators=["u_ada"],
                            users=[user("ada", 10000), user("bob", 0), user("cy", 0)],
                            payments=[pay_rec("p_1", "ada", "bob", 1000, T1),
                                      pay_rec("p_2", "bob", "ada", 1000, T2)]))
    err(batch(w.ada, [item("p_1", 1, 0, at(T1))]), 409, "insufficient_funds")
    b = ok(batch(w.ada, [item("p_1", 1, 0, at(T1)), item("p_2", 1, 0, at(T2))]), 201)
    assert len(b["revisions"]) == 2
    assert (w.ada.balance(), w.bob.balance()) == (10000, 0)


@pytest.mark.req("S4-028")
def test_rejected_batch_changes_nothing(w):
    """S4-028 "A rejected batch leaves history, balances and idempotency records unchanged." """
    p = ok(w.ada.pay("bob", 100), 201)
    q = ok(w.cy.pay("dan", 400), 201)
    ok(w.dan.pay("ada", 100), 201)                 # dan holds 300: q -> 0 is unaffordable
    k = new_key()
    before = ([c.balance() for c in w.clients.values()], revisions(w.ada, p["payment_id"]),
              {x: v for x, v in statement(w.dan).items() if x != "snapshot"})
    err(batch(w.ada, [item(p, 1, 50), item(q, 1, 0)], key=k), 409, "insufficient_funds")
    after = ([c.balance() for c in w.clients.values()], revisions(w.ada, p["payment_id"]),
             {x: v for x, v in statement(w.dan).items() if x != "snapshot"})
    assert after == before
    ok(batch(w.ada, [item(p, 1, 50)], key=k), 201)


# ---- receipts, statements, replays ------------------------------------------------------------------

@pytest.mark.req("S4-031", "S4-033")
def test_originals_and_replays(settled):
    """S4-031 "Original payments and receipts never change. Original payment and settlement
    retries return their original bodies." S4-033 replays."""
    w = settled
    k_pay = new_key()
    p = ok(w.ada.pay("bob", 100, key=k_pay), 201)
    k_set = new_key()
    s2 = ok(w.ada.settle([{"from_handle": "ada", "to_handle": "cy", "amount": 10}], key=k_set), 201)
    k_b = new_key()
    body = [item(p, 1, 60)] + members(w, 0, 0)
    b = ok(batch(w.ada, body, key=k_b), 201)
    assert ok(batch(w.ada, body, key=k_b), 200) == b
    err(batch(w.ada, [item(p, 1, 61)] + members(w, 0, 0), key=k_b), 409, "idempotency_key_reuse")
    assert ok(w.ada.pay("bob", 100, key=k_pay), 200) == p
    assert ok(w.ada.settle([{"from_handle": "ada", "to_handle": "cy", "amount": 10}], key=k_set), 200) == s2
    feed = {x["payment_id"]: x for x in w.ada.feed()}
    assert feed[p["payment_id"]] == p


@pytest.mark.req("S4-032")
def test_statements_and_snapshots_after_batch(settled):
    """S4-032 "New statements reflect the new revisions; earlier snapshot tokens continue to page
    their frozen entries." """
    w = settled
    first, entries = full_statement(w.cy)
    ok(batch(w.ada, members(w, 100, 40)), 201)
    page = ok(w.cy.get("/statement", params={"snapshot": first["snapshot"], "limit": 200}), 200)
    assert page["entries"] == entries and page["closing_balance"] == first["closing_balance"]
    now = statement(w.cy)
    d = {e["payment"]["payment_id"]: (e["delta"], e["revision"]) for e in now["entries"]}
    assert d[w.m1["payment_id"]] == (100, 2) and d[w.m2["payment_id"]] == (-40, 2)
    assert now["closing_balance"] == w.cy.balance() == 500 + 100 - 40


@pytest.mark.req("S4-034", "S4-022")
def test_refunds_do_not_join_settlements(settled):
    """S4-034 / D4-3 after a member is refunded, a batch still names exactly the original members,
    and may not go below the refunded amount."""
    w = settled
    ok(refund(w.cy, w.m1["payment_id"], 120), 201)
    err(batch(w.ada, members(w, 119, 100)), 422, "refund_exceeds_payment")
    ok(batch(w.ada, members(w, 120, 100)), 201)


# ---- concurrency ---------------------------------------------------------------------------------------

@pytest.mark.req("S4-035")
def test_concurrent_batches_share_a_revision(w):
    """S4-035 "Concurrent corrections sharing any expected payment revision cannot both succeed." —
    batches overlapping on one payment, and single corrections racing them."""
    p = ok(w.ada.pay("bob", 1000), 201)
    others = [ok(w.ada.pay("bob", 10), 201) for _ in range(10)]
    cs = [Api(w.ada.base_url, w.ada.token) for _ in range(20)]

    def go(i):
        if i % 2:
            return correct(cs[i], p["payment_id"], 1, 900 - i, p["created_at"])
        return batch(cs[i], [item(others[i // 2], 1, 5), item(p, 1, 800 - i)])
    try:
        out = burst(go, 20)
    finally:
        for c in cs:
            c.close()
    assert sum(r.status_code == 201 for r in out) == 1, [r.status_code for r in out]
    for r in out:
        if r.status_code != 201:
            err(r, 409, "stale_revision")
    assert len(revisions(w.ada, p["payment_id"])) == 2


@pytest.mark.req("S4-035", "S1-013")
def test_batches_on_a_large_history_within_limits(make_world):
    """Standing (case memory): 5000 seeded payments, then 30 concurrent batches and refunds — each
    answers within 5 s."""
    import time
    pays = [pay_rec(f"p_{i:05d}", "ada" if i % 2 else "bob", "bob" if i % 2 else "ada", 1 + i % 5,
                    ago(seconds=20000 - i * 3)) for i in range(5000)]
    w = make_world(fixture2(operators=["u_ada"], users=[user("ada", 10 ** 7), user("bob", 10 ** 7)],
                            payments=pays))
    cs = [Api(w.ada.base_url, w.ada.token if i % 2 else w.bob.token) for i in range(30)]

    def go(i):
        t = time.time()
        if i % 2:
            pid = f"p_{(i * 37) % 5000:05d}"
            r = batch(cs[i], [item(pid, 1, 1, pays[int(pid[2:])]["created_at"])])
        else:
            pid = f"p_{(i * 41 + 1) % 5000 | 1:05d}"                 # odd: ada -> bob, bob refunds
            r = refund(cs[i], pid, 1)
        return r.status_code, time.time() - t
    try:
        out = burst(go, 30, workers=30)
    finally:
        for c in cs:
            c.close()
    assert all(code in (201, 409) for code, _ in out), out
    assert max(t for _, t in out) < 5.0
