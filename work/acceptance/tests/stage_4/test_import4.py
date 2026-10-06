"""Stage 4: earlier-stage exports, export/import of refunds and batches, edited exports."""
import copy
import os

import pytest

from conftest import Api, err, fixture, new_key, ok, ts, user
from edits import get_at, paths_of, record_holding, set_at
from s2 import authorize, capture, fixture2, me
from s3 import correct, full_statement, revisions, statement
from s4 import batch, item, refund

STAGE_URLS = {int(k.split("_")[1]): v for k, v in os.environ.items()
              if k.startswith("STAGE_") and k.endswith("_URL") and v}


def prev_state(url, stage):
    prev = Api(url)
    ok(prev.post("/_test/reset", (fixture2 if stage >= 2 else fixture)(operators=["u_ada"])), 204)
    tok = {h: ok(prev.login(f"{h}@example.com"), 200)["token"] for h in ("ada", "bob", "cy")}
    a = Api(url, tok["ada"])
    s = ok(a.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 300},
                     {"from_handle": "cy", "to_handle": "ada", "amount": 100}]), 201)
    k = new_key()
    p = ok(a.pay("bob", 700, key=k), 201)
    out = {"tok": tok, "s": s, "p": p, "k": k}
    if stage >= 3:
        out["corr"] = ok(correct(a, p["payment_id"], 1, 650, p["created_at"]), 201)
        first, entries = full_statement(a)
        out["snap_tok"], out["snap_entries"] = first["snapshot"], entries
    out["export"] = ok(prev.get("/_test/export"), 200)
    return out


@pytest.mark.req("S4-036")
@pytest.mark.parametrize("stage", [1, 2, 3])
def test_earlier_exports_import(stage, api, reset):
    """S4-036 "A stage-4 service must accept exports produced by the same team's stages 1–3,
    retaining settlement membership, corrections and snapshots." """
    url = STAGE_URLS.get(stage)
    if not url:
        pytest.skip(f"no stage-{stage} service (STAGE_{stage}_URL): run through run.sh")
    st = prev_state(url, stage)
    reset(fixture2())
    ok(api().post("/_test/import", st["export"]), 204)
    ada, cy = api(st["tok"]["ada"]), api(st["tok"]["cy"])
    m1, m2 = st["s"]["payments"]
    err(batch(ada, [item(m1, 1, 0, st["s"]["committed_at"])]), 422, "incomplete_settlement")
    if stage >= 3:
        assert [r["amount"] for r in revisions(ada, st["p"]["payment_id"])] == [700, 650]
        page = ok(ada.get("/statement", params={"snapshot": st["snap_tok"], "limit": 200}), 200)
        assert [e["payment"]["payment_id"] for e in page["entries"]] == \
            [e["payment"]["payment_id"] for e in st["snap_entries"]]
        assert [e["balance_after"] for e in page["entries"]] == \
            [e["balance_after"] for e in st["snap_entries"]]
        rev = 2
    else:
        rev = 1
    replay = ok(ada.pay("bob", 700, key=st["k"]), 200)
    for f, v in st["p"].items():
        assert replay[f] == v, f
    eff = st["s"]["committed_at"]
    ok(batch(ada, [item(m1, 1, 0, eff), item(m2, 1, 0, eff)]), 201)
    assert ok(refund(api(st["tok"]["bob"]), st["p"]["payment_id"], 10), 201)["refund_of"] == \
        st["p"]["payment_id"]


@pytest.fixture
def rich(make_world):
    w = make_world(fixture2(operators=["u_ada"]))
    w.p = ok(w.ada.pay("bob", 1000, note="n"), 201)
    w.k_ref = new_key()
    w.r = ok(refund(w.bob, w.p["payment_id"], 250, key=w.k_ref), 201)
    w.s = ok(w.ada.settle([{"from_handle": "bob", "to_handle": "cy", "amount": 300},
                           {"from_handle": "cy", "to_handle": "dan", "amount": 100}]), 201)
    w.k_b = new_key()
    eff = w.s["committed_at"]
    w.body = [item(w.s["payments"][0], 1, 200, eff), item(w.s["payments"][1], 1, 50, eff)]
    w.b = ok(batch(w.ada, w.body, key=w.k_b), 201)
    w.snap = ok(Api(w.ada.base_url).get("/_test/export"), 200)
    return w


@pytest.mark.req("S4-037")
def test_refunds_and_batches_survive_import(rich, api, reset):
    """S4-037 export/import keeps refunds, batches and their replays."""
    w = rich
    view = {h: (me(c), c.feed(), {k: v for k, v in statement(c).items() if k != "snapshot"})
            for h, c in w.clients.items()}
    reset(fixture())
    ok(api().post("/_test/import", w.snap), 204)
    assert {h: (me(c), c.feed(), {k: v for k, v in statement(c).items() if k != "snapshot"})
            for h, c in w.clients.items()} == view
    assert ok(refund(w.bob, w.p["payment_id"], 250, key=w.k_ref), 200) == w.r
    assert ok(batch(w.ada, w.body, key=w.k_b), 200) == w.b
    err(refund(w.bob, w.p["payment_id"], 751), 422, "refund_exceeds_payment")
    rv = revisions(w.cy, w.s["payments"][0]["payment_id"])[-1]
    assert rv["correction_batch_id"] == w.b["correction_batch_id"]


def edit_import(w, api, fn):
    doc = copy.deepcopy(w.snap)
    if fn(doc["state"]) is False:
        pytest.skip("the export's state does not show this value")
    err(api().post("/_test/import", doc), 422, "validation_failed")


@pytest.mark.req("S4-037", "S1-158")
def test_edited_refund_of_unknown(rich, api):
    """S4-037 a refund whose `refund_of` names no payment."""
    def edit(state):
        recs = [r for r in record_holding(state, w.r["payment_id"]) if w.p["payment_id"] in r.values()]
        recs = [r for r in recs if r.get("amount") == 250]
        if not recs:
            return False
        for r in recs:
            for k, v in list(r.items()):
                if v == w.p["payment_id"]:
                    r[k] = "p_ghost"
    w = rich
    edit_import(w, api, edit)


@pytest.mark.req("S4-037", "S4-007")
def test_edited_refund_above_payment(rich, api):
    """S4-037 / S4-007 a refund amount edited above its target's corrected amount."""
    w = rich

    def edit(state):
        hits = [r for r in record_holding(state, w.r["payment_id"]) if r.get("amount") == 250]
        if not hits:
            return False
        for r in hits:
            r["amount"] = 1001
    edit_import(w, api, edit)


@pytest.mark.req("S4-037", "S4-029")
def test_edited_batch_recorded_at_split(rich, api):
    """S4-037 / S4-029 one member's batch revision moved to another `recorded_at`."""
    w = rich
    ms = round(ts(w.b["recorded_at"]).timestamp() * 1000)

    def edit(state):
        hits = paths_of(state, lambda v: v == ms or v == w.b["recorded_at"])
        if not hits:
            return False
        p = hits[0]
        v = get_at(state, p)
        set_at(state, p, ms - 5 if isinstance(v, int) else "2001-01-01T00:00:00+00:00")
    edit_import(w, api, edit)


@pytest.mark.req("S4-037", "S1-158")
@pytest.mark.parametrize("route,field,value", [("refund", "amount", 251), ("refund", "refund_of", "p_x"),
                                               ("refund", "note", "edited"),
                                               ("batch", "correction_batch_id", "cb_x"),
                                               ("batch", "recorded_at", "2001-01-01T00:00:00+00:00")])
def test_edited_receipts_new_routes(rich, api, route, field, value):
    """Standing (case memory): any single field of a stored refund or batch receipt edited: 422."""
    w = rich
    target = w.r if route == "refund" else w.b

    def edit(state):
        idn = target["payment_id"] if route == "refund" else target["correction_batch_id"]
        hits = [r for r in record_holding(state, idn) if field in r and r.get(field) == target[field]
                and set(r) >= set(target) - {"revisions"}]
        if not hits:
            return False
        for r in hits:
            r[field] = value
    edit_import(w, api, edit)
