"""Stage 2 browser tests: every element is found by its `data-testid`. Expected values come
from the requirements (formatted amounts, statuses, presence rules)."""
import re
import time

import pytest

from conftest import Api, RFC3339, fixture, new_key, ok, ts, user
from s2 import (amount_attr, auth, authorize, auths_list, capture, fixture2, hours, me, money,
                sel, sign_in, text, void)

ROUTES = ["/", "/requests", "/split", "/authorizations"]
LONG = "W" * 200   # a 200-character note with no break opportunity


@pytest.fixture
def seeded(make_world):
    return make_world(fixture2(operators=["u_ada"]))


def visible(page, testid):
    loc = page.locator(sel(testid))
    return loc.count() > 0 and loc.first.is_visible()


def wait_amount(page, testid, minor, timeout=8000):
    page.wait_for_selector(f"{sel(testid)}[data-amount='{minor}']", timeout=timeout)


def fill_pay(page, handle="bob", amount="15.00", note=None, visibility=None):
    page.fill(sel("pay-handle"), handle)
    page.fill(sel("pay-amount"), amount)
    if note is not None:
        page.fill(sel("pay-note"), note)
    if visibility:
        page.select_option(sel("pay-visibility"), visibility)


def writes(page):
    """Record every non-GET request the page sends."""
    seen = []
    page.on("request", lambda r: seen.append((r.method, r.url, r.post_data, dict(r.headers)))
            if r.method not in ("GET", "HEAD", "OPTIONS") else None)
    return seen


def goto_form(page, testid):
    """Open the screen that holds the given form (the spec does not fix the authorise form's
    route): `/` first, then `/authorizations`."""
    for route in ("/", "/authorizations"):
        page.goto(route)
        try:
            page.wait_for_selector(sel(testid), timeout=3000)
            return route
        except Exception:
            continue
    raise AssertionError(f"no screen shows {testid}")


# ---- routes and navigation -------------------------------------------------------------

@pytest.mark.req("S2-002", "S2-003", "S2-004", "S2-140", "S2-010")
@pytest.mark.parametrize("route,anchor", [("/", "pay-submit"), ("/", "wallet-balance"),
                                          ("/", "request-submit"), ("/requests", "incoming-list"),
                                          ("/requests", "outgoing-list"),
                                          ("/split", "split-submit"),
                                          ("/authorizations", "authorize-submit")])
def test_routes_reachable_by_url(seeded, page, route, anchor):
    """S2-002..S2-004 / S2-140 "The following screens must be reachable by URL." (the authorise
    form may be on `/` or `/authorizations`)."""
    sign_in(page)
    if anchor == "authorize-submit":
        goto_form(page, anchor)
        return
    page.goto(route)
    page.wait_for_selector(sel(anchor), state="attached")


@pytest.mark.req("S2-005", "S2-006")
def test_signup_and_login_reachable_signed_out(seeded, page):
    """S2-005 / S2-006 `/signup` and `/login` by URL, signed out."""
    page.goto("/signup")
    page.wait_for_selector(sel("signup-submit"))
    page.goto("/login")
    page.wait_for_selector(sel("login-submit"))


@pytest.mark.req("S2-007", "S2-023")
def test_authorizations_reachable_through_the_ui(seeded, page):
    """S2-007 "Other screens must be reachable through the UI." — a link from `/` reaches
    `/authorizations` by clicking."""
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel("wallet-balance"))
    page.locator("a[href$='/authorizations']").first.click()
    page.wait_for_url(re.compile(r".*/authorizations$"))
    page.wait_for_selector(f"{sel('authorization-list')}, {sel('empty-authorizations')}",
                           state="attached")


@pytest.mark.req("S2-023")
def test_navigation_is_consistent(seeded, page):
    """S2-023 "keep navigation consistent across the required routes." — the same set of
    internal links to the main screens on every signed-in route."""
    sign_in(page)
    sets = {}
    for route in ROUTES:
        page.goto(route)
        page.wait_for_selector(sel("current-user"))
        hrefs = page.eval_on_selector_all(
            "a[href]", "els => els.map(e => new URL(e.href).pathname)")
        sets[route] = {h for h in hrefs if h in ROUTES}
    for route, s in sets.items():
        assert s == set(ROUTES) or s == set(ROUTES) - {route}, (route, s)


# ---- auth ----------------------------------------------------------------------------------

@pytest.mark.req("S2-025", "S2-028", "S2-029")
def test_signup_signs_in(seeded, page):
    """S2-025 signup; S2-028 current-user contains the display name; S2-029 current-handle is
    exactly the handle."""
    page.goto("/signup")
    page.fill(sel("signup-email"), "Zoë.Q+x@example.com")
    page.fill(sel("signup-password"), "correct horse")
    page.fill(sel("signup-display-name"), "Zoë Quinn")
    page.click(sel("signup-submit"))
    page.wait_for_selector(sel("current-user"))
    assert "Zoë Quinn" in text(page, "current-user")
    assert page.locator(sel("current-handle")).first.text_content().strip() == "zo__q_x"


@pytest.mark.req("S2-027")
def test_auth_error_absent_until_an_error(seeded, page):
    """S2-027 "`auth-error` | Error message. Present only when there is one" """
    for route in ("/login", "/signup"):
        page.goto(route)
        page.wait_for_selector(sel(f"{route[1:]}-submit"))
        assert page.locator(sel("auth-error")).count() == 0, route


@pytest.mark.req("S2-026", "S2-027")
@pytest.mark.parametrize("email,pw", [("ada@example.com", "wrong horse!"),
                                      ("nobody@example.com", "correct horse")])
def test_bad_login(seeded, page, email, pw):
    """S2-026 / S2-027 a refused login shows `auth-error` and does not sign in."""
    page.goto("/login")
    page.fill(sel("login-email"), email)
    page.fill(sel("login-password"), pw)
    page.click(sel("login-submit"))
    page.wait_for_selector(sel("auth-error"))
    assert text(page, "auth-error") != ""
    assert page.locator(sel("current-user")).count() == 0


@pytest.mark.req("S2-025", "S2-027")
@pytest.mark.parametrize("email,pw", [("ada@example.com", "correct horse"),   # email taken
                                      ("new1@example.com", "short"),           # < 8 chars
                                      ("bob@elsewhere.example", "correct horse"),  # handle taken
                                      ("not-an-email", "correct horse")])
def test_bad_signup(seeded, page, email, pw):
    """S2-027 refused signups show `auth-error`."""
    page.goto("/signup")
    page.fill(sel("signup-email"), email)
    page.fill(sel("signup-password"), pw)
    page.fill(sel("signup-display-name"), "X")
    page.click(sel("signup-submit"))
    page.wait_for_selector(sel("auth-error"))
    assert page.locator(sel("current-user")).count() == 0


@pytest.mark.req("S2-028", "S2-029")
@pytest.mark.parametrize("route", ROUTES)
def test_current_user_on_every_screen(seeded, page, route):
    """S2-028 "Visible on every screen when signed in"."""
    sign_in(page, "bob@example.com")
    page.goto(route)
    page.wait_for_selector(sel("current-user"))
    assert page.locator(sel("current-user")).first.is_visible()
    assert "Bob" in text(page, "current-user")
    assert page.locator(sel("current-handle")).first.text_content().strip() == "bob"


@pytest.mark.req("S2-030")
def test_logout(seeded, page):
    """S2-030 `logout-button` signs out: `current-user` goes, and `/` no longer shows the
    wallet."""
    sign_in(page)
    page.click(sel("logout-button"))
    page.wait_for_selector(sel("current-user"), state="detached")
    page.goto("/")
    time.sleep(0.5)
    assert page.locator(sel("wallet-balance")).count() == 0
    assert page.locator(sel("current-user")).count() == 0


# ---- wallet and formatting ---------------------------------------------------------------------

@pytest.mark.req("S2-031", "S2-042", "S2-141")
@pytest.mark.parametrize("currency,units,balance,shown", [
    ("EUR", 2, 10000, "100.00 EUR"), ("EUR", 2, 5, "0.05 EUR"), ("EUR", 2, 0, "0.00 EUR"),
    ("JPY", 0, 1200, "1200 JPY"), ("JPY", 0, 0, "0 JPY"), ("BHD", 3, 10000, "10.000 BHD"),
    ("BHD", 3, 5, "0.005 BHD"), ("EUR", 2, 100000000000, "1000000000.00 EUR")])
def test_wallet_balance_format(make_world, page, currency, units, balance, shown):
    """S2-042 "the decimal with exactly `minor_units` decimal places, a single space, then the
    currency code ... For a `minor_units` of `0` there is no decimal point at all" """
    make_world(fixture2(currency=currency, users=[user("ada", balance), user("bob", 0)]))
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel("wallet-balance"))
    assert text(page, "wallet-balance") == shown
    assert amount_attr(page, "wallet-balance") == str(balance)
    assert text(page, "wallet-available") == shown
    assert amount_attr(page, "wallet-available") == str(balance)


@pytest.mark.req("S2-142", "S2-143", "S2-156", "S2-093")
def test_wallet_with_seeded_holds_right_after_reset(make_world, page):
    """S2-156 "Show available funds as the user's spending balance, including immediately after
    reset with open holds." S2-143 `wallet-held` present when held is not zero."""
    make_world(fixture2(authorizations=[auth("a_1", "ada", "bob", 2500),
                                        auth("a_2", "ada", "cy", 100, status="voided")]))
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel("wallet-available"))
    assert text(page, "wallet-available") == "75.00 EUR"
    assert amount_attr(page, "wallet-available") == "7500"
    assert text(page, "wallet-held") == "25.00 EUR"
    assert amount_attr(page, "wallet-held") == "2500"
    assert text(page, "wallet-balance") == "100.00 EUR"
    assert amount_attr(page, "wallet-balance") == "10000"


@pytest.mark.req("S2-143")
def test_wallet_held_absent_when_zero(seeded, page):
    """S2-143 "Absent when `held` is zero" """
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel("wallet-available"))
    assert page.locator(sel("wallet-held")).count() == 0


@pytest.mark.req("S2-012", "S2-142", "S2-016")
def test_available_is_the_headline(make_world, page):
    """S2-012 "Available funds must be the clearest monetary value once holds exist, with total
    and held funds visibly secondary." (D2-8: larger font, or same size and heavier)."""
    make_world(fixture2(authorizations=[auth("a_1", "ada", "bob", 2500)]))
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel("wallet-held"))
    style = """el => { const s = getComputedStyle(el);
                       return [parseFloat(s.fontSize), parseInt(s.fontWeight)]; }"""
    av = page.locator(sel("wallet-available")).first.evaluate(style)
    for other in ("wallet-balance", "wallet-held"):
        o = page.locator(sel(other)).first.evaluate(style)
        assert (av[0] > o[0]) or (av[0] == o[0] and av[1] > o[1]), (other, av, o)


# ---- pay form ------------------------------------------------------------------------------------

@pytest.mark.req("S2-033")
def test_visibility_options(seeded, page):
    """S2-033 "Option values are those two strings" """
    sign_in(page)
    page.goto("/")
    vals = page.eval_on_selector_all(f"{sel('pay-visibility')} option",
                                     "els => els.map(e => e.value)")
    assert sorted(vals) == ["private", "public"]


@pytest.mark.req("S2-034", "S2-032", "S2-067", "S2-046")
def test_pay_moves_money_and_refreshes(seeded, page):
    """S2-034 pay; S2-067 "the balance, the feed ... show the new state without a manual
    reload." """
    sign_in(page)
    page.goto("/")
    fill_pay(page, "bob", "15.00", "dinner 🍝", "private")
    page.click(sel("pay-submit"))
    wait_amount(page, "wallet-balance", 8500)
    assert text(page, "wallet-balance") == "85.00 EUR"
    feed = seeded.ada.feed()
    assert len(feed) == 1 and feed[0]["amount"] == 1500 and feed[0]["visibility"] == "private"
    assert feed[0]["note"] == "dinner 🍝"
    pid = feed[0]["payment_id"]
    page.wait_for_selector(sel(f"activity-item-{pid}"))
    assert page.get_attribute(sel(f"activity-item-{pid}"), "data-visibility") == "private"


@pytest.mark.req("S2-043")
@pytest.mark.parametrize("typed,minor", [("15", 1500), ("15.00", 1500), ("15.5", 1550),
                                         ("0.01", 1), ("100", 10000), ("007.10", 710)])
def test_decimal_input_to_minor_units(seeded, page, typed, minor):
    """S2-043 "`15.00` and `15` both submit `1500`; `15.5` submits `1550`." """
    sign_in(page)
    page.goto("/")
    fill_pay(page, "bob", typed)
    page.click(sel("pay-submit"))
    wait_amount(page, "wallet-balance", 10000 - minor)
    assert seeded.bob.balance() == 2500 + minor


@pytest.mark.req("S2-043", "S2-044")
@pytest.mark.parametrize("currency,typed,minor", [("JPY", "15", 15), ("JPY", "15.5", None),
                                                  ("JPY", "15.0", None), ("BHD", "1.5", 1500),
                                                  ("BHD", "0.001", 1), ("BHD", "1.2345", None)])
def test_decimal_input_other_currencies(make_world, page, currency, typed, minor):
    """S2-043 / S2-044 the rule follows `minor_units`: JPY takes no decimals, BHD three."""
    w = make_world(fixture2(currency=currency))
    sign_in(page)
    page.goto("/")
    sent = writes(page)
    fill_pay(page, "bob", typed)
    page.click(sel("pay-submit"))
    if minor is None:
        page.wait_for_selector(sel("pay-error"))
        time.sleep(0.3)
        assert not [s for s in sent if "/payments" in s[1]], "nothing may be sent"
        assert w.ada.balance() == 10000
    else:
        wait_amount(page, "wallet-balance", 10000 - minor)


@pytest.mark.req("S2-044")
@pytest.mark.parametrize("typed", ["15.005", "abc", "15,00", "1e3", "", "1.2.3", "--5"])
def test_bad_amount_refused_without_a_request(seeded, page, typed):
    """S2-044 "Nonnumeric input or more than `minor_units` decimal places must show the form's
    error element without sending a request." (D2-7)"""
    sign_in(page)
    page.goto("/")
    sent = writes(page)
    fill_pay(page, "bob", typed)
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-error"))
    time.sleep(0.3)
    assert not sent, sent
    assert amount_attr(page, "wallet-balance") == "10000"
    assert seeded.bob.balance() == 2500


@pytest.mark.req("S2-044", "S2-037", "S2-060", "S2-065", "S2-144", "S2-145")
@pytest.mark.parametrize("form", ["request", "split", "authorize"])
def test_bad_amount_refused_in_every_form(seeded, page, form):
    """S2-044 the same rule on every amount input: request, split and authorise forms."""
    sign_in(page)
    if form == "authorize":
        goto_form(page, "authorize-submit")
    else:
        page.goto("/split" if form == "split" else "/")
    sent = writes(page)
    if form == "split":
        page.fill(sel("split-amount"), "10.005")
        page.fill(sel("split-handles"), "ada,bob")
    else:
        page.fill(sel(f"{form}-handle"), "bob")
        page.fill(sel(f"{form}-amount"), "10.005")
    page.click(sel(f"{form}-submit"))
    page.wait_for_selector(sel(f"{form}-error"))
    time.sleep(0.3)
    assert not sent, sent


@pytest.mark.req("S2-035")
@pytest.mark.parametrize("email,handle,amount,note", [
    ("cy@example.com", "bob", "5.01", ""),          # insufficient funds (cy holds 5.00)
    ("ada@example.com", "nobody", "1.00", ""),      # unknown handle
    ("ada@example.com", "ada", "1.00", ""),         # self payment
    ("ada@example.com", "bob", "1.00", "x" * 201)])  # note too long
def test_pay_error_on_refusal(seeded, page, email, handle, amount, note):
    """S2-035 "`pay-error` | Error message, when the payment is refused — including insufficient
    funds" """
    sign_in(page, email)
    page.goto("/")
    fill_pay(page, handle, amount, note)
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-error"))
    assert text(page, "pay-error") != ""
    assert page.locator(sel("pay-uncertain")).count() == 0


@pytest.mark.req("S2-038", "S2-039")
def test_double_submit_pays_once(seeded, page):
    """S2-038 "Keep the pay form's values after success." S2-039 "Submitting it again without
    changing a field must not send another payment" """
    sign_in(page)
    page.goto("/")
    fill_pay(page, "bob", "15.00", "once", "private")
    page.click(sel("pay-submit"))
    wait_amount(page, "wallet-balance", 8500)
    assert page.input_value(sel("pay-handle")) == "bob"
    assert page.input_value(sel("pay-amount")) == "15.00"
    assert page.input_value(sel("pay-note")) == "once"
    assert page.input_value(sel("pay-visibility")) == "private"
    for _ in range(2):
        page.click(sel("pay-submit"))
        time.sleep(0.7)
    assert page.locator(sel("pay-error")).count() == 0
    assert amount_attr(page, "wallet-balance") == "8500"
    assert len(seeded.ada.feed()) == 1
    assert seeded.ada.balance() == 8500


@pytest.mark.req("S2-040")
@pytest.mark.parametrize("field,value", [("pay-amount", "16.00"), ("pay-note", "again"),
                                         ("pay-handle", "cy")])
def test_changed_field_is_a_new_payment(seeded, page, field, value):
    """S2-040 "Changing a field makes the next submission a new payment request." """
    sign_in(page)
    page.goto("/")
    fill_pay(page, "bob", "15.00", "first")
    page.click(sel("pay-submit"))
    wait_amount(page, "wallet-balance", 8500)
    page.fill(sel(field), value)
    page.click(sel("pay-submit"))
    spent = 1600 if field == "pay-amount" else 1500
    wait_amount(page, "wallet-balance", 8500 - spent)
    assert len(seeded.ada.feed()) == 2


@pytest.mark.req("S2-040")
def test_changed_visibility_is_a_new_payment(seeded, page):
    """S2-040 changing the visibility select is a field change too."""
    sign_in(page)
    page.goto("/")
    fill_pay(page, "bob", "15.00", "", "public")
    page.click(sel("pay-submit"))
    wait_amount(page, "wallet-balance", 8500)
    page.select_option(sel("pay-visibility"), "private")
    page.click(sel("pay-submit"))
    wait_amount(page, "wallet-balance", 7000)


# ---- request form ---------------------------------------------------------------------------------

@pytest.mark.req("S2-036")
def test_request_form_creates_a_request(seeded, page):
    """S2-036 the request form asks the named payer for the typed amount."""
    sign_in(page)
    page.goto("/")
    page.fill(sel("request-handle"), "bob")
    page.fill(sel("request-amount"), "12.34")
    page.fill(sel("request-note"), "taxi")
    page.click(sel("request-submit"))
    for _ in range(50):
        got = seeded.bob.requests_list()
        if got:
            break
        time.sleep(0.1)
    assert [(r["requester_handle"], r["amount"], r["note"]) for r in got] == \
        [("ada", 1234, "taxi")]


@pytest.mark.req("S2-037")
@pytest.mark.parametrize("handle,amount", [("ada", "1.00"), ("nobody", "1.00"),
                                           ("bob", "0"), ("bob", "10000000.01")])
def test_request_error(seeded, page, handle, amount):
    """S2-037 "`request-error` | Error message, when the request is refused" """
    sign_in(page)
    page.goto("/")
    page.fill(sel("request-handle"), handle)
    page.fill(sel("request-amount"), amount)
    page.click(sel("request-submit"))
    page.wait_for_selector(sel("request-error"))
    assert seeded.bob.requests_list() == []


# ---- activity feed -------------------------------------------------------------------------------

@pytest.mark.req("S2-045", "S2-046", "S2-047", "S2-048", "S2-049")
def test_feed_items(seeded, page):
    """S2-046..S2-049: one item per visible payment, visibility attribute, both handles, exact
    amount and exact note (also when empty, and when it looks like markup)."""
    notes = ["dinner", "", "<b>bold</b> & <i>x</i>", "😀 é ñ"]
    made = [ok(seeded.ada.pay("bob", 100 + i, note=n, visibility="private" if i % 2 else "public"),
               201) for i, n in enumerate(notes)]
    made.append(ok(seeded.bob.pay("cy", 7, visibility="public"), 201))
    hidden = ok(seeded.bob.pay("cy", 9, visibility="private"), 201)
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel("activity-list"))
    for p in made:
        pid = p["payment_id"]
        page.wait_for_selector(sel(f"activity-item-{pid}"), state="attached")
        assert page.get_attribute(sel(f"activity-item-{pid}"), "data-visibility") == p["visibility"]
        parties = page.locator(sel(f"activity-parties-{pid}")).first.text_content()
        assert p["from_handle"] in parties and p["to_handle"] in parties
        assert text(page, f"activity-amount-{pid}") == money(p["amount"])
        assert page.locator(sel(f"activity-note-{pid}")).first.text_content().strip() == p["note"]
    assert page.locator(sel(f"activity-item-{hidden['payment_id']}")).count() == 0
    assert page.locator("b:text('bold')").count() == 0, "a note is text, never markup"
    order = page.eval_on_selector_all(f"{sel('activity-list')} > *",
                                      "els => els.map(e => e.getAttribute('data-testid'))")
    rendered = [o[len("activity-item-"):] for o in order if o and o.startswith("activity-item-")]
    by_id = {p["payment_id"]: p for p in made}
    times = [ts(by_id[i]["created_at"]) for i in rendered]
    assert times == sorted(times, reverse=True)
    assert set(rendered) == set(by_id)


@pytest.mark.req("S2-050")
def test_empty_activity(seeded, page):
    """S2-050 "`empty-activity` | Shown instead of the list when nothing is visible" """
    ok(seeded.bob.pay("cy", 9, visibility="private"), 201)
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel("empty-activity"))
    assert text(page, "empty-activity") != ""
    assert page.locator(sel("activity-list") + " > [data-testid^='activity-item-']").count() == 0


# ---- requests screen ----------------------------------------------------------------------------------

@pytest.fixture
def reqs(seeded):
    w = seeded
    w.r = {}
    w.r["in_pending"] = ok(w.bob.ask("ada", 1200, note="a"), 201)["request_id"]
    w.r["out_pending"] = ok(w.ada.ask("cy", 300, note="b"), 201)["request_id"]
    w.r["in_paid"] = ok(w.cy.ask("ada", 5, note="c"), 201)["request_id"]
    ok(w.ada.pay_request(w.r["in_paid"]), 201)
    w.r["in_declined"] = ok(w.bob.ask("ada", 6), 201)["request_id"]
    ok(w.ada.post(f"/requests/{w.r['in_declined']}/decline"), 200)
    w.r["out_cancelled"] = ok(w.ada.ask("bob", 7), 201)["request_id"]
    ok(w.ada.post(f"/requests/{w.r['out_cancelled']}/cancel"), 200)
    w.r["other"] = ok(w.bob.ask("cy", 8), 201)["request_id"]
    return w


@pytest.mark.req("S2-052", "S2-053", "S2-054", "S2-055", "S2-056", "S2-057", "S2-003")
def test_request_lists_and_buttons(reqs, page):
    """S2-052..S2-057: items in the right list, status attribute, exact amount, and pay/decline
    only on pending incoming, cancel only on pending outgoing."""
    sign_in(page)
    page.goto("/requests")
    page.wait_for_selector(sel("incoming-list"), state="attached")
    r = reqs.r
    expect = {"in_pending": ("incoming", "pending", 1200), "in_paid": ("incoming", "paid", 5),
              "in_declined": ("incoming", "declined", 6),
              "out_pending": ("outgoing", "pending", 300),
              "out_cancelled": ("outgoing", "cancelled", 7)}
    for k, (lst, status, amount) in expect.items():
        rid = r[k]
        item = f"{sel(lst + '-list')} {sel('request-item-' + rid)}"
        page.wait_for_selector(item, state="attached")
        assert page.get_attribute(sel(f"request-item-{rid}"), "data-status") == status
        assert text(page, f"request-amount-{rid}") == money(amount)
        pend_in = lst == "incoming" and status == "pending"
        pend_out = lst == "outgoing" and status == "pending"
        assert (page.locator(sel(f"request-pay-{rid}")).count() > 0) == pend_in, k
        assert (page.locator(sel(f"request-decline-{rid}")).count() > 0) == pend_in, k
        assert (page.locator(sel(f"request-cancel-{rid}")).count() > 0) == pend_out, k
    assert page.locator(sel(f"request-item-{r['other']}")).count() == 0
    assert page.locator(sel("empty-requests")).count() == 0 or \
        not page.locator(sel("empty-requests")).first.is_visible()


@pytest.mark.req("S2-055", "S2-067")
def test_pay_from_requests_screen(reqs, page):
    """S2-055 pay on a pending incoming request; S2-067 the list shows the new state."""
    rid = reqs.r["in_pending"]
    sign_in(page)
    page.goto("/requests")
    page.click(sel(f"request-pay-{rid}"))
    page.wait_for_selector(f"{sel('request-item-' + rid)}[data-status='paid']")
    assert page.locator(sel(f"request-pay-{rid}")).count() == 0
    assert page.locator(sel(f"request-decline-{rid}")).count() == 0
    assert reqs.ada.balance() == 10000 - 5 - 1200


@pytest.mark.req("S2-056", "S2-057")
def test_decline_and_cancel_from_screen(reqs, page):
    """S2-056 / S2-057 decline and cancel buttons act and the list updates."""
    sign_in(page)
    page.goto("/requests")
    page.click(sel(f"request-decline-{reqs.r['in_pending']}"))
    page.wait_for_selector(f"{sel('request-item-' + reqs.r['in_pending'])}[data-status='declined']")
    page.click(sel(f"request-cancel-{reqs.r['out_pending']}"))
    page.wait_for_selector(f"{sel('request-item-' + reqs.r['out_pending'])}[data-status='cancelled']")


@pytest.mark.req("S2-058", "S2-073")
def test_request_cancelled_elsewhere(reqs, page):
    """S2-073 "A request cancelled elsewhere while its pay button is visible must show
    `request-error` when payment is refused and refresh the request list so the stale pay button
    disappears." """
    rid = reqs.r["in_pending"]
    sign_in(page)
    page.goto("/requests")
    page.wait_for_selector(sel(f"request-pay-{rid}"))
    ok(reqs.bob.post(f"/requests/{rid}/cancel"), 200)
    page.click(sel(f"request-pay-{rid}"))
    page.wait_for_selector(sel("request-error"))
    page.wait_for_selector(sel(f"request-pay-{rid}"), state="detached")
    assert page.get_attribute(sel(f"request-item-{rid}"), "data-status") == "cancelled"
    assert reqs.ada.balance() == 10000 - 5


@pytest.mark.req("S2-058")
def test_request_error_on_refused_pay(seeded, page):
    """S2-058 "`request-error` | Shown when a pay, decline or cancel is refused" — paying
    without the funds."""
    rid = ok(seeded.ada.ask("cy", 900), 201)["request_id"]
    sign_in(page, "cy@example.com")
    page.goto("/requests")
    page.click(sel(f"request-pay-{rid}"))
    page.wait_for_selector(sel("request-error"))
    assert seeded.cy.balance() == 500


@pytest.mark.req("S2-058")
def test_request_error_on_refused_decline(reqs, page):
    """S2-058 a decline refused because the request was paid elsewhere."""
    rid = reqs.r["in_pending"]
    sign_in(page)
    page.goto("/requests")
    page.wait_for_selector(sel(f"request-decline-{rid}"))
    ok(reqs.ada.pay_request(rid), 201)
    page.click(sel(f"request-decline-{rid}"))
    page.wait_for_selector(sel("request-error"))


@pytest.mark.req("S2-059")
def test_empty_requests(seeded, page):
    """S2-059 "`empty-requests` | Shown when both lists are empty" """
    ok(seeded.bob.ask("cy", 8), 201)
    sign_in(page)
    page.goto("/requests")
    page.wait_for_selector(sel("empty-requests"))
    assert text(page, "empty-requests") != ""


# ---- split ---------------------------------------------------------------------------------------------

@pytest.mark.req("S2-063", "S2-064", "S2-066", "S2-061")
@pytest.mark.parametrize("amount,handles,shares", [
    ("10.00", "ada,bob,cy", [334, 333, 333]), ("10.00", "cy,bob,ada", [334, 333, 333]),
    ("0.01", "ada,bob,cy", [1, 0, 0]), ("0.10", "ada,bob,cy", [4, 3, 3]),
    ("9.99", "bob,cy,ada", [333, 333, 333]), ("0.05", "ada,bob,cy,dan,eve", None),
    ("7", "bob,cy", [350, 350])])
def test_split_preview(make_world, page, amount, handles, shares):
    """S2-063 / S2-066 "`split-preview` must show the shares the server would compute, by the
    rule in `stage-1.md` §9, before anything is posted." """
    make_world(fixture2(users=[user(h, 1000) for h in ("ada", "bob", "cy", "dan", "eve")]))
    sign_in(page)
    page.goto("/split")
    sent = writes(page)
    page.fill(sel("split-amount"), amount)
    page.fill(sel("split-handles"), handles)
    page.wait_for_selector(sel("split-preview"))
    hs = handles.split(",")
    shares = shares or [1] * 5
    for h, s in zip(hs, shares):
        page.wait_for_selector(f"{sel('split-preview')} {sel('split-share-' + h)}")
        assert text(page, f"split-share-{h}") == money(s), h
    assert not sent, "the preview posts nothing"


@pytest.mark.req("S2-066", "S2-062")
def test_submitted_split_matches_preview(seeded, page):
    """S2-066 "The preview and submitted split must have identical shares." """
    sign_in(page)
    page.goto("/split")
    page.fill(sel("split-amount"), "10.00")
    page.fill(sel("split-handles"), "bob,ada,cy")
    page.fill(sel("split-note"), "pizza")
    page.wait_for_selector(sel("split-share-cy"))
    preview = {h: text(page, f"split-share-{h}") for h in ("bob", "ada", "cy")}
    page.click(sel("split-submit"))
    for _ in range(50):
        theirs = seeded.ada.requests_list(direction="outgoing")
        if len(theirs) == 2:
            break
        time.sleep(0.1)
    got = {r["payer_handle"]: money(r["amount"]) for r in theirs}
    assert got == {"bob": preview["bob"], "cy": preview["cy"]}
    assert preview["bob"] == money(334)
    assert all(r["note"] == "pizza" for r in theirs)


@pytest.mark.req("S2-065")
@pytest.mark.parametrize("handles", ["ada,nobody", "ada,ada", ""])
def test_split_error(seeded, page, handles):
    """S2-065 "`split-error` | Error message, when the split is refused" """
    sign_in(page)
    page.goto("/split")
    page.fill(sel("split-amount"), "10.00")
    page.fill(sel("split-handles"), handles)
    page.click(sel("split-submit"))
    page.wait_for_selector(sel("split-error"))
    assert seeded.bob.requests_list() == []


@pytest.mark.req("S2-064", "S2-042")
def test_split_preview_jpy(make_world, page):
    """S2-064 exact formatted share, in a `minor_units` 0 service."""
    make_world(fixture2(currency="JPY"))
    sign_in(page)
    page.goto("/split")
    page.fill(sel("split-amount"), "10")
    page.fill(sel("split-handles"), "ada,bob,cy")
    page.wait_for_selector(sel("split-share-ada"))
    assert [text(page, f"split-share-{h}") for h in ("ada", "bob", "cy")] == \
        ["4 JPY", "3 JPY", "3 JPY"]


# ---- refresh, competing clients, uncertain outcomes -------------------------------------------------------

@pytest.mark.req("S2-070", "S2-077")
def test_wallet_refresh_keeps_the_form(seeded, page):
    """S2-070 "`wallet-refresh` ... refreshes the balance and feed without clearing the pay
    form." S2-077 available and held refresh too."""
    sign_in(page)
    page.goto("/")
    wait_amount(page, "wallet-balance", 10000)
    fill_pay(page, "cy", "3.21", "keep me", "private")
    p = ok(seeded.ada.pay("bob", 300), 201)
    ok(authorize(seeded.ada, "bob", 700), 201)
    page.click(sel("wallet-refresh"))
    wait_amount(page, "wallet-balance", 9700)
    wait_amount(page, "wallet-available", 9000)
    wait_amount(page, "wallet-held", 700)
    page.wait_for_selector(sel(f"activity-item-{p['payment_id']}"))
    assert page.input_value(sel("pay-handle")) == "cy"
    assert page.input_value(sel("pay-amount")) == "3.21"
    assert page.input_value(sel("pay-note")) == "keep me"
    assert page.input_value(sel("pay-visibility")) == "private"


@pytest.mark.req("S2-071")
def test_latest_refresh_wins(seeded, page):
    """S2-071 "a delayed earlier read must not overwrite a later refresh, including when
    responses arrive out of order." The first refresh's reads are answered (stale) only after
    the second refresh has shown the new state."""
    sign_in(page)
    page.goto("/")
    wait_amount(page, "wallet-balance", 10000)
    held = []
    state = {"hold": True}

    def handler(route):
        req = route.request
        if state["hold"] and req.method == "GET" and req.resource_type in ("fetch", "xhr",
                                                                           "document"):
            try:
                held.append((route, route.fetch()))
            except Exception:
                route.continue_()
            return
        route.continue_()

    page.route("**/*", handler)
    page.click(sel("wallet-refresh"))
    for _ in range(50):
        if held:
            break
        page.wait_for_timeout(100)
    assert held, "the refresh read nothing"
    state["hold"] = False
    ok(seeded.ada.pay("bob", 1234), 201)
    page.click(sel("wallet-refresh"))
    wait_amount(page, "wallet-balance", 10000 - 1234)
    for route, resp in held:
        try:
            route.fulfill(response=resp)
        except Exception:
            pass
    page.wait_for_timeout(1500)
    assert amount_attr(page, "wallet-balance") == str(10000 - 1234)
    page.unroute("**/*")


@pytest.mark.req("S2-072", "S2-035")
def test_refused_payment_refreshes_and_keeps_inputs(seeded, page):
    """S2-072 "A refused payment shows `pay-error`, refreshes the balance/feed, and preserves all
    pay inputs." Another client spends cy's balance first."""
    sign_in(page, "cy@example.com")
    page.goto("/")
    wait_amount(page, "wallet-balance", 500)
    fill_pay(page, "bob", "4.00", "lunch", "private")
    spent = ok(seeded.cy.pay("ada", 300), 201)
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-error"))
    wait_amount(page, "wallet-balance", 200)
    page.wait_for_selector(sel(f"activity-item-{spent['payment_id']}"))
    assert page.input_value(sel("pay-handle")) == "bob"
    assert page.input_value(sel("pay-amount")) == "4.00"
    assert page.input_value(sel("pay-note")) == "lunch"
    assert page.input_value(sel("pay-visibility")) == "private"


def lose_next_payment(page, commit=True):
    """Intercept the next payment POST: send it to the server (commit) or not, then lose the
    response."""
    state = {"done": False, "headers": None, "body": None}

    def handler(route):
        req = route.request
        if not state["done"] and req.method == "POST":
            state["done"] = True
            state["headers"], state["body"] = dict(req.headers), req.post_data
            if commit:
                try:
                    route.fetch()
                except Exception:
                    pass
            route.abort("connectionreset")
            return
        route.continue_()

    page.route("**/*", handler)
    return state


@pytest.mark.req("S2-074", "S2-075", "S2-041")
@pytest.mark.parametrize("commit", [True, False])
def test_lost_payment_response(seeded, page, commit):
    """S2-074 "If a payment response is lost, including after `POST /payments` commits, show
    `pay-uncertain` (nonempty text), not `pay-error`." S2-075 "Successful retry removes both
    error/uncertainty elements, refreshes the balance and feed, and moves money exactly once." """
    sign_in(page)
    page.goto("/")
    wait_amount(page, "wallet-balance", 10000)
    fill_pay(page, "bob", "15.00", "lost")
    lost = lose_next_payment(page, commit)
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-uncertain"))
    assert text(page, "pay-uncertain") != ""
    assert page.locator(sel("pay-error")).count() == 0
    page.unroute("**/*")
    retry = writes(page)
    page.click(sel("pay-submit"))
    wait_amount(page, "wallet-balance", 8500)
    page.wait_for_selector(sel("pay-uncertain"), state="detached")
    assert page.locator(sel("pay-error")).count() == 0
    assert seeded.ada.balance() == 8500 and len(seeded.ada.feed()) == 1
    page.wait_for_selector(sel(f"activity-item-{seeded.ada.feed()[0]['payment_id']}"))
    posts = [r for r in retry if r[0] == "POST"]
    if posts and lost["headers"] and "idempotency-key" in lost["headers"]:
        assert posts[0][3].get("idempotency-key") == lost["headers"]["idempotency-key"]
        assert posts[0][2] == lost["body"]


@pytest.mark.req("S2-074")
def test_uncertain_retry_survives_edit_and_restore(seeded, page):
    """S2-074 "Keep the unchanged form retryable with the **same key and body**." — a field
    edited and then changed back is unchanged (case memory: retry identity kept)."""
    sign_in(page)
    page.goto("/")
    wait_amount(page, "wallet-balance", 10000)
    fill_pay(page, "bob", "15.00", "lost")
    lose_next_payment(page, True)
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-uncertain"))
    page.unroute("**/*")
    page.fill(sel("pay-amount"), "16.00")
    page.fill(sel("pay-amount"), "15.00")
    page.click(sel("pay-submit"))
    wait_amount(page, "wallet-balance", 8500)
    time.sleep(0.5)
    assert seeded.ada.balance() == 8500 and len(seeded.ada.feed()) == 1


@pytest.mark.req("S2-068")
def test_refresh_waits_for_a_slow_write(seeded, page):
    """S2-068 "Navigation must wait for the write to succeed before it refreshes the data." — the
    payment's response is delayed; the screen must end on the new balance, not a read taken
    before the write finished."""
    sign_in(page)
    page.goto("/")
    wait_amount(page, "wallet-balance", 10000)
    fill_pay(page, "bob", "15.00")
    slow = {"route": None, "resp": None}

    def handler(route):
        if route.request.method == "POST" and slow["route"] is None:
            slow["route"], slow["resp"] = route, route.fetch()
            return
        route.continue_()
    page.route("**/*", handler)
    page.click(sel("pay-submit"))
    for _ in range(50):
        if slow["route"]:
            break
        page.wait_for_timeout(100)
    page.wait_for_timeout(1200)
    slow["route"].fulfill(response=slow["resp"])
    page.unroute("**/*")
    wait_amount(page, "wallet-balance", 8500)


# ---- authorisations UI -------------------------------------------------------------------------------------

@pytest.mark.req("S2-144", "S2-142", "S2-143", "S2-067", "S2-156")
def test_authorize_form(seeded, page):
    """S2-144 the authorise form; S2-156 "The UI must reflect ... newly created holds." """
    sign_in(page)
    route = goto_form(page, "authorize-submit")
    page.fill(sel("authorize-handle"), "bob")
    page.fill(sel("authorize-amount"), "20.00")
    page.fill(sel("authorize-note"), "deposit")
    page.select_option(sel("authorize-visibility"), "private")
    page.click(sel("authorize-submit"))
    for _ in range(50):
        got = auths_list(seeded.ada)
        if got:
            break
        time.sleep(0.1)
    assert [(a["to_handle"], a["amount"], a["note"], a["visibility"]) for a in got] == \
        [("bob", 2000, "deposit", "private")]
    page.goto("/")
    wait_amount(page, "wallet-available", 8000)
    wait_amount(page, "wallet-held", 2000)
    assert text(page, "wallet-held") == "20.00 EUR"


@pytest.mark.req("S2-145")
@pytest.mark.parametrize("handle,amount", [("bob", "100.01"), ("ada", "1.00"), ("nobody", "1.00")])
def test_authorize_error(seeded, page, handle, amount):
    """S2-145 "Shown when the authorisation is refused, including insufficient available
    funds" """
    ok(authorize(seeded.ada, "cy", 1), 201)   # 100.00 total, 99.99 available
    sign_in(page)
    goto_form(page, "authorize-submit")
    page.fill(sel("authorize-handle"), handle)
    page.fill(sel("authorize-amount"), amount)
    page.click(sel("authorize-submit"))
    page.wait_for_selector(sel("authorize-error"))
    assert len(auths_list(seeded.ada)) == 1


@pytest.fixture
def auths(seeded):
    w = seeded
    w.a = {}
    w.a["in_open"] = ok(authorize(w.bob, "ada", 2000, note="in"), 201)
    w.a["out_open"] = ok(authorize(w.ada, "cy", 1500), 201)
    w.a["in_captured"] = ok(authorize(w.cy, "ada", 300), 201)
    ok(capture(w.ada, w.a["in_captured"]["authorization_id"], {"amount": 250}), 201)
    w.a["out_voided"] = ok(authorize(w.ada, "bob", 100), 201)
    ok(void(w.ada, w.a["out_voided"]["authorization_id"]), 200)
    w.a["in_partial"] = ok(authorize(w.bob, "ada", 900), 201)
    ok(capture(w.ada, w.a["in_partial"]["authorization_id"], {"amount": 123, "final": False}), 201)
    w.a["other"] = ok(authorize(w.bob, "cy", 5), 201)
    return w


@pytest.mark.req("S2-146", "S2-147", "S2-148", "S2-149", "S2-150", "S2-151", "S2-152", "S2-153")
def test_authorization_list(auths, page):
    """S2-146..S2-153: items newest first, status, exact amount, captured only when captured,
    expires as RFC 3339, capture input/button only on incoming open, void only on outgoing open."""
    sign_in(page)
    page.goto("/authorizations")
    page.wait_for_selector(sel("authorization-list"))
    a = auths.a
    for k, x in a.items():
        aid = x["authorization_id"]
        if k == "other":
            assert page.locator(sel(f"authorization-item-{aid}")).count() == 0
            continue
        cur = next(y for y in auths_list(auths.ada) if y["authorization_id"] == aid)
        page.wait_for_selector(sel(f"authorization-item-{aid}"), state="attached")
        assert page.get_attribute(sel(f"authorization-item-{aid}"), "data-status") == cur["status"]
        assert text(page, f"authorization-amount-{aid}") == money(cur["amount"])
        has_cap = page.locator(sel(f"authorization-captured-{aid}")).count() > 0
        assert has_cap == (cur["status"] == "captured"), k
        if has_cap:
            assert text(page, f"authorization-captured-{aid}") == money(cur["captured_amount"])
        exp = text(page, f"authorization-expires-{aid}")
        assert RFC3339.match(exp) and ts(exp) == ts(cur["expires_at"]), exp
        incoming_open = cur["to_handle"] == "ada" and cur["status"] == "open"
        outgoing_open = cur["from_handle"] == "ada" and cur["status"] == "open"
        assert (page.locator(sel(f"authorization-capture-{aid}")).count() > 0) == incoming_open, k
        assert (page.locator(sel(f"authorization-capture-amount-{aid}")).count() > 0) == \
            incoming_open, k
        assert (page.locator(sel(f"authorization-void-{aid}")).count() > 0) == outgoing_open, k
        if incoming_open:
            val = page.input_value(sel(f"authorization-capture-amount-{aid}"))
            assert re.fullmatch(r"\d+(\.\d{1,2})?", val), val
            whole, _, frac = val.partition(".")
            assert int(whole) * 100 + int((frac + "00")[:2]) == cur["remaining_amount"], val
    order = page.eval_on_selector_all(f"{sel('authorization-list')} > *",
                                      "els => els.map(e => e.getAttribute('data-testid'))")
    rendered = [o[len("authorization-item-"):] for o in order
                if o and o.startswith("authorization-item-")]
    created = {x["authorization_id"]: ts(x["created_at"]) for x in a.values()}
    times = [created[i] for i in rendered]
    assert times == sorted(times, reverse=True)


@pytest.mark.req("S2-151", "S2-152", "S2-067")
def test_capture_from_screen(auths, page):
    """S2-152 capture with a typed partial amount; the list shows the new state."""
    aid = auths.a["in_open"]["authorization_id"]
    sign_in(page)
    page.goto("/authorizations")
    page.fill(sel(f"authorization-capture-amount-{aid}"), "12.50")
    page.click(sel(f"authorization-capture-{aid}"))
    page.wait_for_selector(f"{sel('authorization-item-' + aid)}[data-status='captured']")
    assert text(page, f"authorization-captured-{aid}") == "12.50 EUR"
    assert auths.bob.balance() == 2500 - 1250
    assert page.locator(sel(f"authorization-capture-{aid}")).count() == 0


@pytest.mark.req("S2-153", "S2-067")
def test_void_from_screen(auths, page):
    """S2-153 void an outgoing open authorisation; the hold is released."""
    aid = auths.a["out_open"]["authorization_id"]
    sign_in(page)
    page.goto("/authorizations")
    page.click(sel(f"authorization-void-{aid}"))
    page.wait_for_selector(f"{sel('authorization-item-' + aid)}[data-status='voided']")
    assert page.locator(sel(f"authorization-void-{aid}")).count() == 0
    assert me(auths.ada)["held"] == 0


@pytest.mark.req("S2-154")
def test_authorization_error_on_refused_capture_and_void(auths, page):
    """S2-154 "`authorization-error` | Shown when a capture or a void is refused" — the
    authorisation was closed elsewhere first."""
    a_in = auths.a["in_open"]["authorization_id"]
    a_out = auths.a["out_open"]["authorization_id"]
    sign_in(page)
    page.goto("/authorizations")
    page.wait_for_selector(sel(f"authorization-capture-{a_in}"))
    ok(void(auths.bob, a_in), 200)
    ok(capture(auths.cy, a_out), 201)
    page.click(sel(f"authorization-capture-{a_in}"))
    page.wait_for_selector(sel("authorization-error"))
    page.goto("/authorizations")
    page.wait_for_selector(sel("authorization-list"))
    if page.locator(sel(f"authorization-void-{a_out}")).count():
        page.click(sel(f"authorization-void-{a_out}"))
        page.wait_for_selector(sel("authorization-error"))


@pytest.mark.req("S2-155")
def test_empty_authorizations(seeded, page):
    """S2-155 "`empty-authorizations` | Shown when the list is empty" """
    ok(authorize(seeded.bob, "cy", 5), 201)
    sign_in(page)
    page.goto("/authorizations")
    page.wait_for_selector(sel("empty-authorizations"))


@pytest.mark.req("S2-097", "S2-147")
def test_expired_shown_without_a_write(make_world, page):
    """S2-097 the screen shows `expired` once the deadline passes (ttl 2 s, D2-2)."""
    w = make_world(fixture2(ttl=2))
    aid = ok(authorize(w.ada, "bob", 300), 201)["authorization_id"]
    time.sleep(3)
    sign_in(page)
    page.goto("/authorizations")
    page.wait_for_selector(f"{sel('authorization-item-' + aid)}[data-status='expired']")
    page.goto("/")
    wait_amount(page, "wallet-available", 10000)
    assert page.locator(sel("wallet-held")).count() == 0


# ---- upgrade continuity (browser half, decision D2-1) -------------------------------------------------------

@pytest.mark.req("S2-079", "S2-162", "S2-163", "S2-164")
def test_page_survives_export_import_under_it(seeded, page, api, reset):
    """S2-079 "A browser signed in before that export/import upgrade must remain signed in
    afterwards." S2-162 the lost payment is recovered after import; S2-164 "No page reload ...
    The form and pending retry identity must survive"; S2-163 pending requests stay payable on
    the request screen."""
    rid = ok(seeded.bob.ask("ada", 400), 201)["request_id"]
    sign_in(page)
    page.goto("/")
    wait_amount(page, "wallet-balance", 10000)
    fill_pay(page, "bob", "15.00", "lost before export")
    lose_next_payment(page, True)
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-uncertain"))
    page.unroute("**/*")
    snap = ok(api().get("/_test/export"), 200)
    reset(fixture(users=[user("zed", 1)]))
    ok(api().post("/_test/import", snap), 204)
    page.click(sel("pay-submit"))                      # same page, no reload
    wait_amount(page, "wallet-balance", 8500)
    page.wait_for_selector(sel("pay-uncertain"), state="detached")
    assert page.locator(sel("pay-error")).count() == 0
    assert seeded.ada.balance() == 8500 and len(seeded.ada.feed()) == 1
    assert page.locator(sel("current-user")).first.is_visible()
    page.locator("a[href$='/requests']").first.click()
    page.wait_for_selector(sel(f"request-pay-{rid}"))
    page.click(sel(f"request-pay-{rid}"))
    page.wait_for_selector(f"{sel('request-item-' + rid)}[data-status='paid']")
    assert seeded.ada.balance() == 8100


# ---- product qualities with measurable proxies ----------------------------------------------------------------

def populate(w):
    ok(w.ada.pay("bob", 1234, note=LONG), 201)
    ok(w.bob.pay("ada", 99, note="thanks", visibility="private"), 201)
    ok(w.bob.ask("ada", 777, note=LONG), 201)
    ok(w.ada.ask("cy", 5, note="short"), 201)
    ok(authorize(w.ada, "bob", 2000, note=LONG), 201)
    ok(authorize(w.bob, "ada", 300), 201)


@pytest.mark.req("S2-018")
@pytest.mark.parametrize("width", [375, 1280])
@pytest.mark.parametrize("route", ROUTES + ["/login", "/signup"])
def test_no_horizontal_scroll(seeded, new_page, width, route):
    """S2-018 "at a 375 CSS-pixel viewport and at conventional desktop widths, without
    horizontal page scrolling." — with 200-character unbroken notes on screen."""
    populate(seeded)
    page = new_page(width=width)
    if route not in ("/login", "/signup"):
        sign_in(page)
    page.goto(route)
    anchor = {"/": "wallet-balance", "/requests": "incoming-list", "/split": "split-submit",
              "/authorizations": "current-user", "/login": "login-submit",
              "/signup": "signup-submit"}[route]
    page.wait_for_selector(sel(anchor), state="attached")
    page.wait_for_load_state("networkidle")
    time.sleep(0.3)
    sw, cw = page.evaluate("[document.documentElement.scrollWidth, "
                           "document.documentElement.clientWidth]")
    assert sw <= cw, f"{route} at {width}px scrolls sideways: {sw} > {cw}"


@pytest.mark.req("S2-019")
@pytest.mark.parametrize("route,inputs", [
    ("/", ["pay-handle", "pay-amount", "pay-note", "pay-visibility", "request-handle",
           "request-amount", "request-note"]),
    ("/split", ["split-amount", "split-handles", "split-note"]),
    ("/login", ["login-email", "login-password"]),
    ("/signup", ["signup-email", "signup-password", "signup-display-name"])])
def test_inputs_have_visible_labels(seeded, page, route, inputs):
    """S2-019 "Inputs need visible labels" (D2-6)."""
    if route not in ("/login", "/signup"):
        sign_in(page)
    page.goto(route)
    page.wait_for_selector(sel(inputs[0]))
    js = """el => {
      const texts = [];
      if (el.labels) for (const l of el.labels) {
        const r = l.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && getComputedStyle(l).visibility !== 'hidden'
            && l.textContent.trim()) texts.push(l.textContent.trim());
      }
      const ids = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean);
      for (const id of ids) { const n = document.getElementById(id);
        if (n && n.getBoundingClientRect().width > 0 && n.textContent.trim()) texts.push(n.textContent.trim()); }
      return texts; }"""
    for t in inputs:
        assert page.locator(sel(t)).first.evaluate(js), f"{t} has no visible label"


@pytest.mark.req("S2-020")
@pytest.mark.parametrize("testid", ["pay-amount", "pay-submit"])
def test_keyboard_focus_is_visible(seeded, page, testid):
    """S2-020 "keyboard focus must be apparent" — focusing by keyboard changes the element's
    outline, box-shadow, border or background."""
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel(testid))
    style = """el => { const s = getComputedStyle(el);
      return [s.outlineStyle + s.outlineWidth + s.outlineColor, s.boxShadow, s.borderColor,
              s.backgroundColor].join('|'); }"""
    loc = page.locator(sel(testid)).first
    before = loc.evaluate(style)
    page.locator(sel("pay-handle")).first.focus()
    for _ in range(12):
        if loc.evaluate("el => el === document.activeElement"):
            break
        page.keyboard.press("Tab")
    assert loc.evaluate("el => el === document.activeElement"), "not reachable by Tab"
    after = loc.evaluate(style)
    assert after != before, "no visible focus indicator"


CONTRAST_JS = """el => {
  function rgb(s) { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  function lum(c) { const a = c.slice(0, 3).map(v => { v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  let n = el, bg = null;
  while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor);
    if (c && c[3] > 0.5) { bg = c; break; } n = n.parentElement; }
  if (!bg) bg = [255, 255, 255, 1];
  const fg = rgb(getComputedStyle(el).color);
  const l1 = lum(fg), l2 = lum(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }"""


@pytest.mark.req("S2-021")
def test_text_contrast(seeded, page):
    """S2-021 "text and controls need sufficient contrast." (D2-3: 4.5:1)"""
    populate(seeded)
    sign_in(page)
    page.goto("/")
    page.wait_for_selector(sel("wallet-held"))
    ids = page.eval_on_selector_all("[data-testid]", "els => els.filter(e => "
                                    "e.offsetParent !== null && e.textContent.trim() && "
                                    "e.children.length === 0).map(e => e.getAttribute('data-testid'))")
    page.fill(sel("pay-amount"), "abc")
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-error"))
    ids = list(dict.fromkeys(ids + ["pay-error", "pay-submit"]))
    bad = []
    for t in ids:
        loc = page.locator(sel(t)).first
        if not loc.is_visible():
            continue
        r = loc.evaluate(CONTRAST_JS)
        if r < 4.5:
            bad.append((t, round(r, 2)))
    assert not bad, bad


@pytest.mark.req("S2-016", "S2-074")
def test_error_and_uncertain_look_different(seeded, page):
    """S2-016 refused and uncertain states are visually distinct (D2-8)."""
    sign_in(page)
    page.goto("/")
    wait_amount(page, "wallet-balance", 10000)
    fill_pay(page, "bob", "abc")
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-error"))
    style = """el => { const s = getComputedStyle(el);
      return [s.color, s.backgroundColor, s.borderColor, s.borderLeftColor].join('|'); }"""
    err_style = page.locator(sel("pay-error")).first.evaluate(style)
    fill_pay(page, "bob", "1.00")
    lose_next_payment(page, False)
    page.click(sel("pay-submit"))
    page.wait_for_selector(sel("pay-uncertain"))
    page.unroute("**/*")
    unc_style = page.locator(sel("pay-uncertain")).first.evaluate(style)
    assert err_style != unc_style, (err_style, unc_style)


@pytest.mark.req("S2-017", "S2-013")
def test_no_raw_identifiers_or_timestamps(seeded, page):
    """S2-017 "expose technical identifiers only where they help the user." — the visible text
    of `/` and `/requests` shows no payment, request or user ids and no raw RFC 3339
    timestamps."""
    p = ok(seeded.ada.pay("bob", 1234, note="x"), 201)
    r = ok(seeded.bob.ask("ada", 777, note="y"), 201)
    sign_in(page)
    for route in ("/", "/requests"):
        page.goto(route)
        page.wait_for_load_state("networkidle")
        body = page.inner_text("body")
        for raw in (p["payment_id"], r["request_id"], "u_ada", "u_bob", p["created_at"][:19],
                    r["created_at"][:19], '{"'):
            assert raw not in body, (route, raw)


@pytest.mark.req("S2-022")
def test_empty_states_say_something(make_world, page):
    """S2-022 "Provide considered empty ... states" — every empty state carries text."""
    make_world(fixture2())
    sign_in(page, "dan@example.com")
    for route, tid in (("/", "empty-activity"), ("/requests", "empty-requests"),
                       ("/authorizations", "empty-authorizations")):
        page.goto(route)
        page.wait_for_selector(sel(tid))
        assert len(text(page, tid)) >= 3, tid
