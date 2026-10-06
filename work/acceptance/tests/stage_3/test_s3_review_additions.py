"""Stage 3 rows added after the coordinator's review: S3-070..S3-074."""
from datetime import timedelta

import pytest

from conftest import RFC3339, Api, err, err_any, fixture, new_key, ok, ts, user
from s2 import auth, authorize, fixture2, me
from s3 import ago, at, correct, me_at, pay_rec, revisions, statement


@pytest.fixture
def w(make_world):
    return make_world(fixture2(operators=["u_ada"]))


# ---- S3-070 -------------------------------------------------------------------------------

@pytest.mark.req("S3-070", "S3-034")
def test_correction_debit_judged_against_available_receiver(w):
    """S3-070 a decrease debits the receiver: within bob's total, above his available."""
    p = ok(w.ada.pay("bob", 1000), 201)            # bob total 3500
    ok(authorize(w.bob, "cy", 3000), 201)          # bob available 500
    err(correct(w.ada, p["payment_id"], 1, 0, p["created_at"]), 409, "insufficient_funds")
    assert me(w.bob)["total"] == 3500 and len(revisions(w.ada, p["payment_id"])) == 1
    ok(correct(w.ada, p["payment_id"], 1, 500, p["created_at"]), 201)   # debit 500 fits


@pytest.mark.req("S3-070", "S3-034")
def test_correction_debit_judged_against_available_sender(w):
    """S3-070 an increase debits the sender: within ada's total, above her available."""
    p = ok(w.ada.pay("bob", 1000), 201)            # ada total 9000
    ok(authorize(w.ada, "cy", 8800), 201)          # ada available 200
    err(correct(w.ada, p["payment_id"], 1, 1201, p["created_at"]), 409, "insufficient_funds")
    ok(correct(w.ada, p["payment_id"], 1, 1200, p["created_at"]), 201)
    assert me(w.ada)["available"] == 0


# ---- S3-071 -------------------------------------------------------------------------------

@pytest.mark.req("S3-071", "S3-027")
@pytest.mark.parametrize("field,value", [("expected_revision", None), ("expected_revision", True),
                                         ("expected_revision", "1"), ("effective_at", 5),
                                         ("effective_at", None), ("effective_at", True),
                                         ("reason", 5), ("reason", None), ("reason", True),
                                         ("reason", ["x"])])
def test_wrong_types(w, field, value):
    """S3-071 / D3-8: wrong JSON types are 400 or 422, and nothing changes."""
    p = ok(w.ada.pay("bob", 100), 201)
    body = {"expected_revision": 1, "amount": 50, "effective_at": p["created_at"], "reason": "x",
            field: value}
    err_any(w.ada.post(f"/payments/{p['payment_id']}/corrections", body, key=new_key()),
            {(400, "malformed_request"), (422, "validation_failed")})
    assert len(revisions(w.ada, p["payment_id"])) == 1


@pytest.mark.req("S3-071")
@pytest.mark.parametrize("amount", ["50", True, False, [50], {"v": 50}])
def test_amount_wrong_type_is_422(w, amount):
    """S3-071 / §5 "invalid `amount` values (including strings and booleans) ... are 422" """
    p = ok(w.ada.pay("bob", 100), 201)
    err(correct(w.ada, p["payment_id"], 1, amount, p["created_at"]), 422, "validation_failed")


@pytest.mark.req("S3-071", "S1-059")
@pytest.mark.parametrize("raw", ["{nope", "", '{"expected_revision": 1,'])
def test_unparseable_correction_body(w, raw):
    """S3-071 a body that does not parse is 400 `malformed_request`."""
    p = ok(w.ada.pay("bob", 100), 201)
    err(w.ada.request("POST", f"/payments/{p['payment_id']}/corrections", content=raw.encode(),
                      key=new_key()), 400, "malformed_request")


# ---- S3-072 -------------------------------------------------------------------------------

BAD_TIMES = ["yesterday", "2026-09-24", "2026-09-24T10:00:00", "", "2026-02-30T10:00:00+00:00",
             "2026-09-24 10:00:00+00:00", "2026-09-24T25:00:00Z"]


@pytest.mark.req("S3-072", "S3-005")
@pytest.mark.parametrize("bad", BAD_TIMES)
def test_seeded_payment_time_format(world, reset, bad):
    """S3-072 a seeded payment `created_at` that is not an RFC 3339 instant with an offset: 422."""
    err(reset(fixture(payments=[pay_rec("p_f", "ada", "bob", 5, bad)]), expect=None), 422,
        "validation_failed")
    assert world.ada.balance() == 10000


@pytest.mark.req("S3-072", "S3-065")
@pytest.mark.parametrize("bad", BAD_TIMES + ["FUTURE"])
def test_seeded_authorization_time(world, reset, bad):
    """S3-072 a seeded authorisation `created_at` that is malformed or in the future: 422."""
    a = auth("a_1", "ada", "bob", 100)
    a["created_at"] = at(ago(hours=-1)) if bad == "FUTURE" else bad
    err(reset(fixture2(authorizations=[a]), expect=None), 422, "validation_failed")
    assert me(world.ada)["held"] == 0


@pytest.mark.req("S3-072", "S3-065")
def test_seeded_authorization_time_valid(make_world):
    """S3-072 control: a past `created_at` in another offset is accepted."""
    from datetime import timezone
    a = auth("a_1", "ada", "bob", 100)
    a["created_at"] = ago(hours=2).astimezone(timezone(timedelta(hours=9))).isoformat()
    w = make_world(fixture2(authorizations=[a]))
    assert me(w.ada)["held"] == 100
    assert me_at(w.ada, at(ago(hours=3)))["held"] == 0, "held from its seeded created_at only"


@pytest.mark.req("S3-072", "S3-068")
def test_imported_authorization_created_in_future(make_world, api):
    """S3-072 on import: an authorisation's creation time moved 30 days ahead is refused."""
    import copy
    from edits import get_at, paths_of, set_at
    w = make_world(fixture2())
    a = ok(authorize(w.ada, "bob", 100), 201)
    snap = ok(api().get("/_test/export"), 200)
    ms = round(ts(a["created_at"]).timestamp() * 1000)
    ems = round(ts(a["expires_at"]).timestamp() * 1000)
    doc = copy.deepcopy(snap)
    # move creation and expiry together, so only "created in the future" is wrong
    hits = paths_of(doc["state"], lambda v: v in (ms, ems, a["created_at"], a["expires_at"]))
    if not hits:
        pytest.skip("the export's state does not show this value")
    for p in hits:
        v = get_at(doc["state"], p)
        set_at(doc["state"], p, ms + 86400000 * 30 if isinstance(v, int)
               else at(ts(v) + timedelta(days=30)))
    err(api().post("/_test/import", doc), 422, "validation_failed")


# ---- S3-073 -------------------------------------------------------------------------------

@pytest.mark.req("S3-073")
@pytest.mark.parametrize("pid", ["p_nope", "x" * 65, "rq_1"])
def test_revisions_unknown_payment(w, pid):
    """S3-073 `GET /payments/{id}/revisions` on an unknown payment is 404 — next to a known one."""
    p = ok(w.ada.pay("bob", 5), 201)
    assert len(revisions(w.ada, p["payment_id"])) == 1
    err(w.ada.get(f"/payments/{pid}/revisions"), 404, "not_found")


# ---- S3-074 -------------------------------------------------------------------------------

EDGE = ["9999-12-31T23:59:59.999Z", "9899-12-30T23:59:59.999+00:00", "0001-01-01T00:00:00Z",
        "1969-12-31T23:59:59Z", "1970-01-01T00:00:00Z", "2026-09-24T23:30:00-12:00",
        "2026-09-25T09:30:00+14:00", "2026-09-24T10:00:00.123456789Z", "+10000-01-01T00:00:00Z",
        "10000-01-01T00:00:00Z", "9999-12-31T23:59:60Z"]


def check_response(r, sent=None, key=None):
    """No 5xx (the client asserts it), RFC 3339 timestamps, exact echo on 200."""
    if r.status_code == 200:
        body = r.json()
        if key:
            assert body[key] == sent, (body.get(key), sent)
        txt = r.text
        import re
        for m in re.findall(r'"(?:created_at|effective_at|recorded_at|expires_at|closed_at)":"([^"]+)"', txt):
            assert RFC3339.match(m), m
    else:
        err(r, 422, "validation_failed")


@pytest.mark.req("S3-074", "S3-012", "S3-041")
@pytest.mark.parametrize("instant", EDGE)
def test_edge_query_instants(w, instant):
    """S3-074 query instants far in the past and future: 200 with an exact echo, or 422 — never
    a 5xx."""
    ok(w.ada.pay("bob", 5), 201)
    check_response(w.ada.get("/me", params={"as_of": instant}), instant, "as_of")
    check_response(w.ada.get("/me", params={"known_at": instant}), instant, "known_at")
    check_response(w.ada.get("/me", params={"as_of": instant, "known_at": instant}), instant, "as_of")
    for p in ({"from": instant}, {"to": instant}, {"known_at": instant}):
        check_response(w.ada.get("/statement", params=p))
    ok(w.ada.get("/me"), 200)


@pytest.mark.req("S3-074", "S3-027")
@pytest.mark.parametrize("instant", ["0001-01-01T00:00:00Z", "1969-12-31T23:59:59Z",
                                     "1970-01-01T00:00:00Z", "9999-12-31T23:59:59Z",
                                     "2026-09-24T10:00:00.123456789Z"])
def test_edge_effective_at(w, instant):
    """S3-074 a correction `effective_at` far in the past (or the future, which is "later than
    now" and so 422): 201 or 422, never a 5xx; on 201 every later read stays RFC 3339."""
    p = ok(w.ada.pay("bob", 5), 201)
    r = correct(w.ada, p["payment_id"], 1, 4, instant)
    if r.status_code == 201:
        assert RFC3339.match(r.json()["effective_at"])
        for rv in revisions(w.ada, p["payment_id"]):
            assert RFC3339.match(rv["effective_at"]) and RFC3339.match(rv["recorded_at"])
        s = statement(w.ada)
        assert s["opening_balance"] + sum(e["delta"] for e in s["entries"]) == s["closing_balance"]
        ok(Api(w.ada.base_url).get("/_test/export"), 200)
    else:
        err(r, 422, "validation_failed")
    if instant.startswith("9999"):
        assert r.status_code == 422
