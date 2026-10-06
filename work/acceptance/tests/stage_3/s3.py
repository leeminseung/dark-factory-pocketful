"""Stage 3 helpers: seeded payments with times, statements, corrections, revisions."""
from datetime import datetime, timedelta, timezone

from conftest import new_key, ok, ts

UTC = timezone.utc


def at(dt):
    """RFC 3339 with milliseconds and +00:00."""
    return dt.astimezone(UTC).isoformat(timespec="milliseconds")


def ago(**kw):
    return datetime.now(UTC) - timedelta(**kw)


def pay_rec(pid, frm, to, amount, created_at=None, note="", visibility="public"):
    p = {"id": pid, "from_user_id": f"u_{frm}", "to_user_id": f"u_{to}", "amount": amount,
         "note": note, "visibility": visibility}
    if created_at is not None:
        p["created_at"] = at(created_at) if isinstance(created_at, datetime) else created_at
    return p


def me_at(c, as_of=None, known_at=None):
    params = {}
    if as_of is not None:
        params["as_of"] = as_of if isinstance(as_of, str) else at(as_of)
    if known_at is not None:
        params["known_at"] = known_at if isinstance(known_at, str) else at(known_at)
    return ok(c.get("/me", params=params), 200)


def statement(c, **params):
    p = {k: (at(v) if isinstance(v, datetime) else v) for k, v in params.items()}
    return ok(c.get("/statement", params=p), 200)


def full_statement(c, **params):
    """Every entry of a window, paging with limit 200 through the snapshot of the first read."""
    first = statement(c, limit=200, **params)
    entries = list(first["entries"])
    off = len(entries)
    more = first["has_more"]
    while more:
        page = ok(c.get("/statement", params={"snapshot": first["snapshot"], "limit": 200,
                                              "offset": off}), 200)
        entries += page["entries"]
        off += len(page["entries"])
        more = page["has_more"]
    return first, entries


def correct(c, pid, expected_revision, amount, effective_at, reason="fix", key=None, **extra):
    body = {"expected_revision": expected_revision, "amount": amount,
            "effective_at": effective_at if isinstance(effective_at, str) else at(effective_at),
            "reason": reason, **extra}
    return c.post(f"/payments/{pid}/corrections", body, key=new_key() if key is None else key)


def revisions(c, pid):
    return ok(c.get(f"/payments/{pid}/revisions"), 200)["revisions"]


def later(s, **kw):
    return at(ts(s) + timedelta(**kw))


def before(s, **kw):
    return at(ts(s) - timedelta(**kw))
