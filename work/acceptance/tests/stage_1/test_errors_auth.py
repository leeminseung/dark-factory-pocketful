"""Stage 1 §5 errors and §6 authentication."""
import json

import pytest

from conftest import Api, err, err_any, new_key, ok, PASSWORD


def nested(depth):
    return "[" * depth + "]" * depth


# ---- §5 error body and codes ---------------------------------------------------

@pytest.mark.req("S1-058", "S1-062", "S1-063")
def test_error_body_shape_on_every_error_status(world):
    """S1-058 "Every 4xx and 5xx response carries this body: `{ "error": { "code", "message" } }`"
    (err() checks code and that message is a string) for 400, 401, 403, 404, 409 and 422."""
    rid = ok(world.bob.ask("ada", 10), 201)["request_id"]
    err(world.ada.post("/payments", {"to_handle": "bob", "amount": 1}), 400,
        "missing_idempotency_key")
    err(world.ada.get("/me", token=None), 401, "unauthenticated")
    err(world.bob.pay_request(rid), 403, "forbidden")
    err(world.ada.pay("nobody", 1), 404, "not_found")
    err(world.dan.pay("ada", 1), 409, "insufficient_funds")
    err(world.ada.pay("bob", 0), 422, "validation_failed")


@pytest.mark.req("S1-059")
@pytest.mark.parametrize("raw", ['{nope', '', '{"to_handle": "bob", "amount": 1',
                                 '{"to_handle": "bob",}', "\xff\xfe", "nul\x00l"])
def test_unparseable_body_is_400(world, raw):
    """S1-059 "400 | `malformed_request` | Unparseable body" """
    r = world.ada.request("POST", "/payments", content=raw.encode("latin-1"), key=new_key())
    err(r, 400, "malformed_request")
    assert world.ada.balance() == 10000


@pytest.mark.req("S1-059")
@pytest.mark.parametrize("path,body", [
    ("/payments", {"to_handle": 5, "amount": 1}),
    ("/payments", {"to_handle": ["bob"], "amount": 1}),
    ("/requests", {"payer_handle": {"h": "ada"}, "amount": 1, "note": "n"}),
    ("/splits", {"amount": 10, "participant_handles": "ada,bob", "note": "n"}),
    ("/auth/signup", {"email": 5, "password": PASSWORD, "display_name": "X"}),
    ("/auth/signup", {"email": "t@example.com", "password": 12345678, "display_name": "X"}),
    ("/auth/login", {"email": ["ada@example.com"], "password": PASSWORD}),
])
def test_field_of_wrong_json_type_is_400(world, path, body):
    """S1-059 "400 | `malformed_request` | ... or a field of the wrong JSON type" (fields other
    than amount, note and visibility, which §5 sends to 422)."""
    r = world.bob.post(path, body, key=new_key())
    err(r, 400, "malformed_request")


@pytest.mark.req("S1-059", "S1-073")
@pytest.mark.parametrize("path", ["/payments", "/requests", "/splits", "/settlements",
                                  "/auth/signup", "/auth/login", "/_test/reset",
                                  "/_test/import", "PAY"])
def test_deeply_nested_body_is_refused_not_crashed(opworld, path):
    """S1-059 a field of the wrong type (a 100000-deep array) or a body the parser cannot take
    is 400 `malformed_request`; S1-073 never 5xx."""
    w = opworld
    if path == "PAY":
        path = f"/requests/{ok(w.bob.ask('ada', 1), 201)['request_id']}/pay"
        field = "visibility"
    else:
        field = {"/payments": "to_handle", "/requests": "payer_handle",
                 "/splits": "participant_handles", "/settlements": "transfers",
                 "/auth/signup": "email", "/auth/login": "email",
                 "/_test/reset": "users", "/_test/import": "state"}[path]
    raw = '{"%s": %s, "amount": 10, "note": "n"}' % (field, nested(100000))
    r = w.ada.request("POST", path, content=raw.encode(), key=new_key())
    err_any(r, {(400, "malformed_request"), (422, "validation_failed")})
    ok(w.ada.get("/me"), 200)


@pytest.mark.req("S1-059", "S1-073")
@pytest.mark.parametrize("raw", ["[]", "[1,2]", '"text"', "42", "null", "true"])
def test_body_that_is_not_an_object(world, raw):
    """S1-059 decision D9: a body that is not a JSON object is 400 or 422, never 2xx/5xx."""
    for path in ("/payments", "/requests", "/splits"):
        r = world.ada.request("POST", path, content=raw.encode(), key=new_key())
        err_any(r, {(400, "malformed_request"), (422, "validation_failed")})


@pytest.mark.req("S1-060")
def test_empty_idempotency_key_is_400(world):
    """S1-060 "400 | `missing_idempotency_key` | Required `Idempotency-Key` header absent or
    empty" """
    err(world.ada.pay("bob", 1, key=""), 400, "missing_idempotency_key")
    assert world.ada.balance() == 10000


@pytest.mark.req("S1-061", "S1-081")
@pytest.mark.parametrize("auth", [None, "", "Bearer", "Basic YWRhOmFkYQ==",
                                  "Bearer not-a-real-token", "bearer", "Token abc",
                                  "Bearer a b c"])
def test_missing_malformed_or_unknown_token_is_401(world, api, auth):
    """S1-061 "401 | `unauthenticated` | Missing, malformed or unknown bearer token" on every
    authenticated endpoint. S1-081 "Every other endpoint requires a bearer token"."""
    c = api()
    headers = {} if auth is None else {"Authorization": auth}
    rid = ok(world.bob.ask("ada", 1), 201)["request_id"]
    calls = [("GET", "/me", None), ("GET", "/activity", None), ("GET", "/requests", None),
             ("POST", "/payments", {"to_handle": "bob", "amount": 1}),
             ("POST", "/requests", {"payer_handle": "bob", "amount": 1, "note": "n"}),
             ("POST", f"/requests/{rid}/pay", {}),
             ("POST", f"/requests/{rid}/decline", None),
             ("POST", f"/requests/{rid}/cancel", None),
             ("POST", "/splits", {"amount": 1, "participant_handles": ["bob"], "note": "n"}),
             ("POST", "/settlements", {"transfers": [
                 {"from_handle": "ada", "to_handle": "bob", "amount": 1}]})]
    for method, path, body in calls:
        r = c.request(method, path, json_body=body, key=new_key(), headers=headers,
                      token=None)
        err(r, 401, "unauthenticated")
    assert world.ada.balance() == 10000
    assert world.bob.requests_list()[0]["status"] == "pending"


@pytest.mark.req("S1-061")
def test_token_of_another_user_case_changed_is_unknown(world, api):
    """S1-061 an altered token is unknown."""
    t = world.ada.token
    altered = t[:-1] + ("A" if t[-1] != "A" else "B")
    err(api(altered).get("/me"), 401, "unauthenticated")


@pytest.mark.req("S1-065")
@pytest.mark.parametrize("path,body", [
    ("/payments", {"amount": 10}),
    ("/payments", {"to_handle": "bob"}),
    ("/payments", {}),
    ("/requests", {"amount": 10, "note": "n"}),
    ("/requests", {"payer_handle": "bob", "note": "n"}),
    ("/splits", {"participant_handles": ["ada", "bob"], "note": "n"}),
    ("/splits", {"amount": 10, "note": "n"}),
])
def test_missing_required_field_is_422(world, path, body):
    """S1-065 "422 | `validation_failed` | A required field ... is missing" """
    err(world.ada.post(path, body, key=new_key()), 422, "validation_failed")


@pytest.mark.req("S1-066", "S1-067")
@pytest.mark.parametrize("note", [None, 5, True, ["a"], {"a": 1}])
def test_non_string_note_is_422_on_every_endpoint(world, note):
    """S1-067 "non-string `note` values (including `null`) ... are 422 `validation_failed`." """
    err(world.ada.pay("bob", 1, note=note), 422, "validation_failed")
    err(world.ada.post("/requests", {"payer_handle": "bob", "amount": 1, "note": note},
                       key=new_key()), 422, "validation_failed")
    err(world.ada.post("/splits", {"amount": 2, "participant_handles": ["ada", "bob"],
                                   "note": note}, key=new_key()), 422, "validation_failed")


@pytest.mark.req("S1-067", "S1-102")
@pytest.mark.parametrize("vis", [None, 1, True, "PRIVATE", " public", "", ["public"]])
def test_bad_visibility_is_422_on_payments_and_pay(world, vis):
    """S1-067 "any `visibility` other than `public` or `private` are 422 `validation_failed`" """
    err(world.ada.pay("bob", 1, visibility=vis), 422, "validation_failed")
    rid = ok(world.bob.ask("ada", 1), 201)["request_id"]
    err(world.ada.pay_request(rid, {"visibility": vis}), 422, "validation_failed")
    assert world.ada.requests_list()[0]["status"] == "pending"


@pytest.mark.req("S1-068", "S1-097")
def test_omission_selects_defaults(world):
    """S1-068 "Omission alone selects the optional-field defaults." """
    p = ok(world.ada.pay("bob", 1), 201)
    assert p["note"] == "" and p["visibility"] == "public"
    rid = ok(world.bob.ask("ada", 1), 201)["request_id"]
    assert ok(world.ada.pay_request(rid, {}), 201)["visibility"] == "public"


@pytest.mark.req("S1-069")
@pytest.mark.parametrize("path", ["/activity", "/requests"])
@pytest.mark.parametrize("name,value", [
    ("limit", "1e1"), ("limit", "4.0"), ("limit", "+4"), ("limit", "-0"), ("limit", " 4"),
    ("limit", "0x10"), ("limit", "4a"), ("limit", ""), ("offset", "1e1"), ("offset", "0.0"),
    ("offset", "+1"), ("offset", "abc"), ("limit", "２"),
])
def test_integer_query_parameters_are_plain_digits(world, path, name, value):
    """S1-069 "An integer-valued **query parameter** is written as plain decimal digits:
    `1e9`, `4.0` and `+4` are 422 `validation_failed` whatever their numeric value." """
    err(world.ada.get(path, params={name: value}), 422, "validation_failed")


@pytest.mark.req("S1-069", "S1-071", "S1-072")
@pytest.mark.parametrize("path", ["/activity", "/requests"])
def test_plain_digit_forms_are_accepted(world, path):
    """S1-069 plain decimal digits are accepted, leading zeros included; a huge offset is
    "0 or more" and just returns nothing."""
    ok(world.ada.get(path, params={"limit": "007"}), 200)
    ok(world.ada.get(path, params={"limit": "1"}), 200)
    ok(world.ada.get(path, params={"limit": "200"}), 200)
    ok(world.ada.get(path, params={"offset": "0"}), 200)
    body = ok(world.ada.get(path, params={"offset": "9" * 40}), 200)
    assert body["has_more"] is False


@pytest.mark.req("S1-070")
def test_idempotency_key_length_bounds(world):
    """S1-070 "`Idempotency-Key` | 1 to 255 characters | 422 `validation_failed`" """
    ok(world.ada.pay("bob", 1, key="k"), 201)
    ok(world.ada.pay("bob", 1, key="x" * 255), 201)
    err(world.ada.pay("bob", 1, key="y" * 256), 422, "validation_failed")
    err(world.ada.pay("bob", 1, key="z" * 10000), 422, "validation_failed")
    assert world.ada.balance() == 10000 - 2


@pytest.mark.req("S1-070")
def test_idempotency_key_length_counts_characters_not_bytes(world):
    """S1-070 "1 to 255 characters" (decision D5): 200 two-byte characters is a valid key."""
    key = "é" * 200
    r = world.ada.request("POST", "/payments",
                          content=b'{"to_handle":"bob","amount":1}',
                          headers={"Idempotency-Key": key.encode("utf-8")})
    ok(r, 201)


@pytest.mark.req("S1-070", "S1-084")
def test_key_length_enforced_on_every_idempotent_path(opworld):
    """S1-070 "Shared ranges, enforced on every endpoint that takes them" """
    w = opworld
    rid = ok(w.bob.ask("ada", 1), 201)["request_id"]
    k = "q" * 256
    err(w.ada.pay("bob", 1, key=k), 422, "validation_failed")
    err(w.bob.ask("ada", 1, key=k), 422, "validation_failed")
    err(w.ada.pay_request(rid, key=k), 422, "validation_failed")
    err(w.ada.split(2, ["ada", "bob"], key=k), 422, "validation_failed")
    err(w.ada.settle([{"from_handle": "ada", "to_handle": "bob", "amount": 1}], key=k),
        422, "validation_failed")


# ---- §6 authentication -----------------------------------------------------------

@pytest.mark.req("S1-074", "S1-075")
def test_signup_and_login_shapes(world, api):
    """S1-074 "POST /auth/signup ... ->  201 { "user_id", "display_name", "token" }";
    S1-075 "POST /auth/login ... ->  200" with the same user."""
    s = ok(world.ada.signup("fresh@example.com", PASSWORD, "Fresh Person"), 201)
    assert s["display_name"] == "Fresh Person"
    assert isinstance(s["user_id"], str) and isinstance(s["token"], str) and s["token"]
    l = ok(api().login("fresh@example.com"), 200)
    assert l["user_id"] == s["user_id"] and l["display_name"] == "Fresh Person"
    me = api(l["token"]).me()
    assert me["user_id"] == s["user_id"] and me["display_name"] == "Fresh Person"
    assert me["handle"] == "fresh" and me["balance"] == 0
    assert me["currency"] == "EUR" and me["minor_units"] == 2


@pytest.mark.req("S1-075")
def test_seeded_user_login_shape(world, api):
    """S1-075 login returns user_id, display_name and token."""
    l = ok(api().login("ada@example.com"), 200)
    assert l["user_id"] == "u_ada" and l["display_name"] == "Ada" and l["token"]


@pytest.mark.req("S1-076")
def test_email_already_registered_is_409(world, api):
    """S1-076 "Email already registered | 409 `email_taken`" — seeded or signed-up; the
    original password still works and the new one does not."""
    err(world.ada.signup("ada@example.com", "other password"), 409, "email_taken")
    ok(world.ada.signup("solo@example.com"), 201)
    err(world.ada.signup("solo@example.com", "different pw"), 409, "email_taken")
    err(api().login("solo@example.com", "different pw"), 401, "unauthenticated")
    ok(api().login("ada@example.com"), 200)


@pytest.mark.req("S1-077")
@pytest.mark.parametrize("pw,good", [("1234567", False), ("", False), ("12345678", True),
                                     ("😀" * 7, False), ("😀" * 8, True),
                                     ("ééé", False), ("        ", True)])
def test_password_shorter_than_8_characters(world, api, pw, good):
    """S1-077 "Password shorter than 8 characters | 422 `validation_failed`" (decision D5:
    characters, not bytes)."""
    email = f"pw{len(pw)}{abs(hash(pw)) % 10000}@example.com"
    r = world.ada.signup(email, pw)
    if good:
        ok(r, 201)
        ok(api().login(email, pw), 200)
    else:
        err(r, 422, "validation_failed")
        err(api().login(email, pw), 401, "unauthenticated")


@pytest.mark.req("S1-078")
@pytest.mark.parametrize("email", ["plainaddress", "@example.com", "local@", "", "@"])
def test_email_not_local_at_domain(world, email):
    """S1-078 "`email` not of the form `local@domain` | 422 `validation_failed`" """
    err(world.ada.signup(email), 422, "validation_failed")


@pytest.mark.req("S1-065")
@pytest.mark.parametrize("missing", ["email", "password", "display_name"])
def test_signup_missing_field_is_422(world, missing):
    """S1-065 a required field missing is 422 `validation_failed`."""
    body = {"email": "m@example.com", "password": PASSWORD, "display_name": "M"}
    del body[missing]
    err(world.ada.post("/auth/signup", body, token=None), 422, "validation_failed")


@pytest.mark.req("S1-079")
def test_wrong_password_or_unknown_email_is_401(world, api):
    """S1-079 "Wrong password or unknown email on login | 401 `unauthenticated`" """
    err(api().login("ada@example.com", "wrong horse"), 401, "unauthenticated")
    err(api().login("ada@example.com", "correct horse "), 401, "unauthenticated")
    err(api().login("nobody@example.com"), 401, "unauthenticated")


@pytest.mark.req("S1-080")
def test_handle_taken_creates_no_account(world, api):
    """S1-080 "The handle derived from the email (§4) is already taken | 409 `handle_taken`,
    and no account is created" — the email stays free for later."""
    err(world.ada.signup("BOB@elsewhere.example"), 409, "handle_taken")
    err(api().login("BOB@elsewhere.example"), 401, "unauthenticated")
    err(world.ada.signup("bob@elsewhere.example"), 409, "handle_taken")


@pytest.mark.req("S1-081")
def test_auth_endpoints_need_no_token(world, api):
    """S1-081 "except `/health`, `/_test/reset` and the two above" — signup and login work
    with no token, and with an unknown one."""
    ok(api("garbage").signup("tokless@example.com"), 201)
    ok(api("garbage").post("/auth/login", {"email": "tokless@example.com",
                                           "password": PASSWORD}), 200)


@pytest.mark.req("S1-082")
def test_multiple_tokens_are_all_valid(world, api):
    """S1-082 "An account may have multiple valid tokens and concurrent sessions." """
    tokens = [ok(api().login("bob@example.com"), 200)["token"] for _ in range(5)]
    assert len(set(tokens)) >= 1
    for t in tokens + [world.bob.token]:
        assert api(t).me()["handle"] == "bob"
    s = ok(world.ada.signup("multi@example.com"), 201)["token"]
    l = ok(api().login("multi@example.com"), 200)["token"]
    assert api(s).me()["handle"] == "multi" and api(l).me()["handle"] == "multi"


@pytest.mark.req("S1-083")
def test_plaintext_passwords_are_not_stored(world, api, control):
    """S1-083 "Plaintext password storage is not permitted." (decision D10: the export is the
    service state; it must not contain a plaintext password.)"""
    secret = "Unique-Pass-" + new_key()
    ok(world.ada.signup("hashme@example.com", secret), 201)
    ok(api().login("hashme@example.com", secret), 200)
    text = control.get("/_test/export").text
    assert secret not in text
    assert secret not in json.dumps(json.loads(text), ensure_ascii=False)


@pytest.mark.req("S1-083")
def test_seeded_plaintext_passwords_are_not_stored(api, reset, control):
    """S1-083 the fixture gives plaintext passwords; the service stores only hashes."""
    from conftest import fixture, user
    secret = "Seeded-Secret-" + new_key()
    reset(fixture(users=[user("ada", 1, password=secret), user("bob", 0)]))
    ok(api().login("ada@example.com", secret), 200)
    assert secret not in control.get("/_test/export").text
