"""Stage 4 helpers: refunds and correction batches."""
from conftest import new_key


def refund(c, pid, amount, key=None, **extra):
    return c.post(f"/payments/{pid}/refunds", {"amount": amount, **extra},
                  key=new_key() if key is None else key)


def item(payment, rev, amount, effective_at=None, reason="batch fix", **extra):
    pid = payment if isinstance(payment, str) else payment["payment_id"]
    eff = effective_at if effective_at is not None else payment["created_at"]
    return {"payment_id": pid, "expected_revision": rev, "amount": amount, "effective_at": eff,
            "reason": reason, **extra}


def batch(c, items, key=None, **extra):
    return c.post("/correction-batches", {"corrections": items, **extra},
                  key=new_key() if key is None else key)
