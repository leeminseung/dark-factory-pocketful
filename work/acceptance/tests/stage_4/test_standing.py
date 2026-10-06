"""Standing tests from case memory, extended to stage-4 writes: same-millisecond order, clock
drift under reads, sub-millisecond instants."""
import threading
import time
from datetime import datetime, timezone

import pytest

from conftest import Api, fixture, ok, ts, user
from s2 import fixture2
from s3 import correct, me_at, pay_rec, statement
from s4 import batch, item, refund


@pytest.mark.req("S3-016", "S4-008")
@pytest.mark.parametrize("loop", range(3))
def test_same_millisecond_writes_keep_creation_order(make_world, loop):
    """S3-016 ties broken so that writes come out in creation order — payments and refunds made
    back to back (case memory: run in a loop)."""
    w = make_world(fixture2(users=[user("ada", 10 ** 6), user("bob", 10 ** 6)]))
    made = []
    for i in range(15):
        p = ok(w.ada.pay("bob", 100 + i), 201)
        made.append(-p["amount"])
        r = ok(refund(w.bob, p["payment_id"], 1 + i), 201)
        made.append(r["amount"])
    s = statement(w.ada, limit=200)
    assert [e["delta"] for e in s["entries"]] == made


@pytest.mark.req("S3-002", "S4-008")
def test_clock_does_not_run_ahead_after_many_reads(make_world):
    """Case memory: after many statement reads (50 in flight), a new refund and batch revision
    are not stamped ahead of real time."""
    w = make_world(fixture2(operators=["u_ada"]))
    p = ok(w.ada.pay("bob", 100), 201)
    stop = time.time() + 6

    def reader():
        c = Api(w.ada.base_url, w.ada.token)
        while time.time() < stop:
            c.get("/statement", params={"limit": 1})
        c.close()
    ths = [threading.Thread(target=reader) for _ in range(50)]
    for t in ths:
        t.start()
    for t in ths:
        t.join()
    r = ok(refund(w.bob, p["payment_id"], 10), 201)
    b = ok(batch(w.ada, [item(p, 1, 90)]), 201)
    now = datetime.now(timezone.utc)
    assert (ts(r["created_at"]) - now).total_seconds() <= 0.05
    assert (ts(b["recorded_at"]) - now).total_seconds() <= 0.05


@pytest.mark.req("S3-043", "S4-018")
def test_batch_sub_millisecond_effective_at(make_world):
    """Case memory: a batch item effective at .0007 does not count at .0006 and counts at .0007."""
    base = datetime.now(timezone.utc).replace(microsecond=0)
    base = base.replace(hour=(base.hour + 23) % 24) if base.hour else base.replace(minute=0)
    T = base.strftime("%Y-%m-%dT%H:%M:%S.")
    t05, t06, t07 = T + "0005Z", T + "0006Z", T + "0007Z"
    if datetime.fromisoformat(t07.replace("Z", "+00:00")) > datetime.now(timezone.utc):
        pytest.skip("base instant not in the past")
    w = make_world(fixture2(operators=["u_ada"], users=[user("ada", 995), user("bob", 5)],
                            payments=[pay_rec("p_1", "ada", "bob", 5, t05)]))
    ok(batch(w.ada, [item("p_1", 1, 4, t07)]), 201)
    assert me_at(w.ada, t06)["balance"] == 1000
    assert me_at(w.ada, t07)["balance"] == 996
