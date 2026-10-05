"""Stage 1 §2 delivery and §3 runtime contract."""
import os
import re
import socket

import pytest

from conftest import (Api, assert_id, assert_timestamp, err, fixture, ok, user,
                      PASSWORD)

STAGE_DIR = os.environ.get("STAGE_DIR", "")


# ---- §2 delivery -----------------------------------------------------------

@pytest.mark.req("S1-006")
def test_stage_folder_has_dockerfile_and_run_md_with_a_command():
    """S1-006 "Deliver an HTTP service, a `Dockerfile` and a `RUN.md` with a command that
    builds and starts the service without manual setup." (The runner built and started the
    folder's Dockerfile with no other step before this test ran.)"""
    if not STAGE_DIR:
        pytest.skip("STAGE_DIR not set: run through work/acceptance/run.sh")
    assert os.path.isfile(os.path.join(STAGE_DIR, "Dockerfile"))
    run_md = os.path.join(STAGE_DIR, "RUN.md")
    assert os.path.isfile(run_md)
    text = open(run_md, encoding="utf-8").read()
    assert re.search(r"docker\s+build", text) and re.search(r"docker\s+run", text), \
        "RUN.md gives a command that builds and starts the service"


@pytest.mark.req("S1-007", "S1-009", "S1-016", "S1-010")
def test_service_runs_alone_with_port_env_and_a_mapping(control):
    """S1-007 "The image must run on its own with `-e PORT=<port>` and a port mapping."
    S1-016 "using the `PORT` environment variable". S1-009 single container.
    S1-010 the runner starts it with --cpus 2 --memory 2g. The runner sets PORT=9137,
    not 8080, and reaches it through a mapping on the host."""
    assert ok(control.get("/health"), 200) == {"status": "ok"}


@pytest.mark.docker
@pytest.mark.req("S1-016")
def test_default_port_is_8080(spawn):
    """S1-016 "Listen on `0.0.0.0` using the `PORT` environment variable, default `8080`."
    A second container is started with no PORT and mapped to container port 8080."""
    url = spawn(port_env=False)
    c = Api(url)
    try:
        assert ok(c.get("/health"), 200) == {"status": "ok"}
    finally:
        c.close()


@pytest.mark.req("S1-011", "S1-018")
def test_first_healthy_response_within_60_seconds():
    """S1-011 "Start to first healthy response | 60 s"; S1-018 "within 60 seconds of
    container start". The runner measures container start to first 200 from /health."""
    seconds = os.environ.get("START_SECONDS")
    if not seconds:
        pytest.skip("START_SECONDS not set: run through work/acceptance/run.sh")
    assert float(seconds) <= 60.0, f"first healthy response after {seconds}s"


# ---- §3.2 health -----------------------------------------------------------

@pytest.mark.req("S1-017", "S1-023")
def test_health_body_and_no_auth(api):
    """S1-017 "GET /health  ->  200  {"status": "ok"}" — needs no token."""
    resp = api().get("/health", token=None)
    assert ok(resp, 200) == {"status": "ok"}
    assert resp.headers.get("content-type", "").startswith("application/json")


@pytest.mark.req("S1-017")
def test_health_ignores_a_bad_token(api):
    """S1-017 /health is outside authentication (§6 "except `/health`")."""
    assert ok(api("not-a-token").get("/health"), 200) == {"status": "ok"}


# ---- §3.3 reset ------------------------------------------------------------

@pytest.mark.req("S1-019", "S1-022")
def test_reset_returns_204_with_no_auth(control):
    """S1-019 "Replace all service state with the fixture ... ->  204 No Content".
    S1-022 "requires no authentication"."""
    resp = control.post("/_test/reset", fixture(), token=None)
    ok(resp, 204)
    assert resp.content in (b"",), "204 has no body"


@pytest.mark.req("S1-022")
def test_reset_ignores_a_bogus_authorization_header(control):
    """S1-022 reset "requires no authentication": a garbage bearer token does not stop it."""
    ok(control.post("/_test/reset", fixture(), token="garbage"), 204)


@pytest.mark.req("S1-020")
def test_reset_replaces_everything(world, api, reset):
    """S1-020 "When reset returns 204, subsequent requests must see only that fixture."
    Users, payments and requests from before the reset are gone."""
    ok(world.ada.pay("bob", 100), 201)
    ok(world.bob.ask("ada", 100), 201)
    ok(world.ada.signup("zed@example.com"), 201)
    fx = fixture(users=[user("ada", 700), user("eve", 300)])
    reset(fx)
    ada = api()
    ada.token = ok(ada.login("ada@example.com"), 200)["token"]
    assert ada.balance() == 700
    assert ada.feed() == []
    assert ada.requests_list() == []
    err(api().login("bob@example.com"), 401, "unauthenticated")
    err(api().login("zed@example.com"), 401, "unauthenticated")
    err(ada.pay("bob", 1), 404, "not_found")


@pytest.mark.req("S1-020", "S1-166")
def test_token_from_before_a_reset_is_unauthenticated(world, reset):
    """S1-020 "subsequent requests must see only that fixture" (decision D1: the old
    session is not part of the new fixture, even when the same fixture is loaded again)."""
    old = world.ada
    reset(world.fixture)
    err(old.get("/me"), 401, "unauthenticated")


@pytest.mark.req("S1-021")
def test_repeated_resets(api, reset):
    """S1-021 "Repeated resets are supported." Five resets in a row, alternating fixtures."""
    for i in range(5):
        fx = fixture(currency=["EUR", "JPY", "BHD"][i % 3],
                     users=[user("ada", 100 + i), user("bob", i)])
        reset(fx)
        c = api()
        c.token = ok(c.login("ada@example.com"), 200)["token"]
        me = c.me()
        assert me["balance"] == 100 + i
        assert me["currency"] == fx["currency"] and me["minor_units"] == fx["minor_units"]


# ---- §3.4 conventions ------------------------------------------------------

@pytest.mark.req("S1-023")
def test_responses_are_json_utf8(world):
    """S1-023 "Requests and responses are `application/json; charset=utf-8`." Checked on
    success and error responses of several endpoints."""
    rid = ok(world.bob.ask("ada", 100), 201)["request_id"]
    responses = [
        world.ada.get("/me"), world.ada.pay("bob", 1), world.ada.get("/activity"),
        world.ada.get("/requests"), world.ada.pay_request(rid),
        world.ada.split(10, ["ada", "bob"]),
        world.ada.pay("nobody", 1), world.ada.get("/me", token=None),
        world.ada.post("/payments", {"to_handle": "bob", "amount": 1}),
        world.ada.login("ada@example.com"),
    ]
    for r in responses:
        ctype = r.headers.get("content-type", "").lower().replace(" ", "")
        assert ctype.startswith("application/json"), (r.request.url, ctype)
        if "charset=" in ctype:
            assert "charset=utf-8" in ctype, ctype
        r.json()


@pytest.mark.req("S1-023", "S1-105")
def test_utf8_body_is_read_as_utf8(world):
    """S1-023 requests are UTF-8 JSON: raw (unescaped) UTF-8 in a note is read correctly."""
    body = '{"to_handle":"bob","amount":5,"note":"Grüße 日本 😀"}'.encode("utf-8")
    r = world.ada.request("POST", "/payments", content=body,
                          key="utf8-" + str(id(body)))
    assert ok(r, 201)["note"] == "Grüße 日本 😀"


@pytest.mark.req("S1-024")
def test_timestamps_have_explicit_offsets(opworld):
    """S1-024 "Timestamps in responses are RFC 3339 with an explicit offset"."""
    w = opworld
    p = ok(w.ada.pay("bob", 10), 201)
    rq = ok(w.bob.ask("ada", 10), 201)
    sp = ok(w.ada.split(10, ["ada", "bob"]), 201)
    paid = ok(w.ada.pay_request(rq["request_id"]), 201)
    st = ok(w.ada.settle([{"from_handle": "ada", "to_handle": "bob", "amount": 1}]), 201)
    stamps = [p["created_at"], rq["created_at"], sp["created_at"], paid["created_at"],
              st["committed_at"], st["payments"][0]["created_at"]]
    stamps += [r["created_at"] for r in sp["requests"]]
    stamps += [x["created_at"] for x in w.ada.feed()]
    stamps += [x["created_at"] for x in w.ada.requests_list()]
    for s in stamps:
        assert_timestamp(s)


@pytest.mark.req("S1-025")
def test_unknown_body_fields_are_ignored_everywhere(opworld, api):
    """S1-025 "Unknown fields in a request body are ignored, never an error." On every
    endpoint that takes a body."""
    w = opworld
    extra = {"colour": "blue", "id": "forged", "from_handle": "cy", "balance": 1}
    ok(w.ada.pay("bob", 10, **extra), 201)
    rid = ok(w.bob.ask("ada", 10, **extra), 201)["request_id"]
    paid = ok(w.ada.pay_request(rid, {"visibility": "private", **extra}), 201)
    assert paid["from_handle"] == "ada", "a body field cannot change the payer"
    ok(w.ada.split(10, ["ada", "bob"], **extra), 201)
    ok(w.ada.settle([{"from_handle": "ada", "to_handle": "bob", "amount": 1, "x": 1}],
                    colour="blue"), 201)
    r2 = ok(w.bob.ask("ada", 10), 201)["request_id"]
    ok(w.ada.post(f"/requests/{r2}/decline", extra), 200)
    r3 = ok(w.bob.ask("ada", 10), 201)["request_id"]
    ok(w.bob.post(f"/requests/{r3}/cancel", extra), 200)
    c = api()
    ok(c.post("/auth/signup", {"email": "x1@example.com", "password": PASSWORD,
                               "display_name": "X", "handle": "chosen", **extra},
              token=None), 201)
    ok(c.post("/auth/login", {"email": "x1@example.com", "password": PASSWORD, **extra},
              token=None), 200)


@pytest.mark.req("S1-026")
def test_unknown_query_parameters_are_ignored(world):
    """S1-026 "Unknown query parameters are ignored." """
    ok(world.ada.get("/me", params={"foo": "bar"}), 200)
    ok(world.ada.get("/activity", params={"page": "x", "sort": "asc"}), 200)
    ok(world.ada.get("/requests", params={"cursor": "%%%", "limit2": "-1"}), 200)
    ok(world.ada.get("/health", params={"x": "1"}), 200)


@pytest.mark.req("S1-027")
def test_ids_are_strings_of_at_most_64_characters(opworld):
    """S1-027 "IDs are opaque strings of at most 64 characters." """
    w = opworld
    p = ok(w.ada.pay("bob", 10), 201)
    rq = ok(w.bob.ask("ada", 10), 201)
    sp = ok(w.ada.split(10, ["ada", "bob"]), 201)
    st = ok(w.ada.settle([{"from_handle": "ada", "to_handle": "bob", "amount": 1}]), 201)
    su = ok(w.ada.signup("idcheck@example.com"), 201)
    for v in (p["payment_id"], p["from_user_id"], p["to_user_id"], rq["request_id"],
              rq["requester_id"], rq["payer_id"], sp["split_id"], st["settlement_id"],
              st["payments"][0]["payment_id"], su["user_id"], w.ada.me()["user_id"]):
        assert_id(v)


@pytest.mark.req("S1-058", "S1-073")
def test_unparseable_request_target_gets_an_error_body(world):
    """S1-058 "Every 4xx and 5xx response carries this body"; S1-073 no 5xx. A raw request
    whose target cannot be parsed as a path."""
    host, port = world.ada.base_url.split("//")[1].split(":")
    for target in ("/%", "/requests/%zz/pay", "/activity?limit=%"):
        s = socket.create_connection((host, int(port)), timeout=5)
        tok = world.ada.token
        s.sendall((f"GET {target} HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer {tok}\r\n"
                   "Connection: close\r\n\r\n").encode())
        data = b""
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            data += chunk
        s.close()
        head, _, body = data.partition(b"\r\n\r\n")
        status = int(head.split(b" ")[1])
        assert status < 500, (target, head)
        if status >= 400:
            # a chunked body would wrap the JSON; find the object
            text = body.decode("utf-8", "replace")
            assert '"error"' in text and '"code"' in text, (target, status, text[:200])


@pytest.mark.req("S1-058", "S1-073")
def test_a_64_kilobyte_header_gets_status_and_error_body(world):
    """S1-058 every 4xx carries the error body; S1-073 no 5xx. A 64 KB header is either
    served normally or refused with the §5 body, never an empty 431."""
    r = world.ada.get("/me", headers={"X-Padding": "a" * 65536})
    assert r.status_code < 500
    if r.status_code >= 400:
        body = r.json()
        assert isinstance(body.get("error", {}).get("code"), str), r.text[:200]
    else:
        assert r.json()["handle"] == "ada"


@pytest.mark.req("S1-063", "S1-058")
def test_unknown_path_is_404_with_error_body(world):
    """S1-063 "404 | `not_found` | No such resource"."""
    err(world.ada.get("/no-such-thing"), 404, "not_found")
    err(world.ada.post("/requests/" + "z" * 300 + "/decline"), 404, "not_found")
