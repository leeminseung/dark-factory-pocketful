"""Stage 2 helpers: fixtures with authorisations, money formatting, page helpers."""
import os
from datetime import datetime, timedelta, timezone

from conftest import BASE_URL, Api, fixture, ok, user  # noqa: F401  (shared helpers)

PREV_BASE_URL = os.environ.get("PREV_BASE_URL", "")


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def hours(n):
    """An RFC 3339 instant n hours from now (seeded expiries are at least an hour away)."""
    return iso(datetime.now(timezone.utc) + timedelta(hours=n))


def auth(aid, frm, to, amount, status="open", expires_at=None, note="hold",
         visibility="public"):
    return {"id": aid, "from_user_id": f"u_{frm}", "to_user_id": f"u_{to}", "amount": amount,
            "note": note, "visibility": visibility, "status": status,
            "expires_at": expires_at or hours(2)}


def fixture2(ttl=None, authorizations=None, **kw):
    fx = fixture(**kw)
    if ttl is not None:
        fx["authorization_ttl_seconds"] = ttl
    if authorizations is not None:
        fx["authorizations"] = authorizations
    return fx


def money(minor, minor_units=2, currency="EUR"):
    """§ Formatted amount: exactly minor_units places, a space, the code; none for 0."""
    if minor_units == 0:
        return f"{minor} {currency}"
    text = str(minor).rjust(minor_units + 1, "0")
    return f"{text[:-minor_units]}.{text[-minor_units:]} {currency}"


def me(c):
    return ok(c.get("/me"), 200)


def authorize(c, to, amount, key=None, **fields):
    from conftest import new_key
    return c.post("/authorizations", {"to_handle": to, "amount": amount, **fields},
                  key=new_key() if key is None else key)


def capture(c, aid, body=None, key=None):
    from conftest import new_key
    return c.post(f"/authorizations/{aid}/capture", {} if body is None else body,
                  key=new_key() if key is None else key)


def void(c, aid):
    return c.post(f"/authorizations/{aid}/void")


def auths_list(c, **params):
    return ok(c.get("/authorizations", params={"limit": 200, **params}), 200)["authorizations"]


def sel(testid):
    return f"[data-testid='{testid}']"


def sign_in(page, email="ada@example.com", password="correct horse"):
    page.goto("/login")
    page.fill(sel("login-email"), email)
    page.fill(sel("login-password"), password)
    page.click(sel("login-submit"))
    page.wait_for_selector(sel("current-user"))


def text(page, testid):
    return page.locator(sel(testid)).first.text_content().strip()


def amount_attr(page, testid):
    return page.get_attribute(sel(testid), "data-amount")
