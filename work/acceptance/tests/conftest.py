"""Shared helpers for the Pocketful acceptance suites.

Black-box only: everything goes through the service's HTTP API. Expected values come from
the requirement text, never from the product. Every 5xx fails the test that saw it (S1-073),
and every call is bounded by the stated per-request timeout (S1-013).
"""
import json
import os
import re
import socket
import subprocess
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import httpx
import pytest

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:8080")
IMAGE_TAG = os.environ.get("IMAGE_TAG", "")
RUN_ID = os.environ.get("RUN_ID", "manual")

REQUEST_TIMEOUT = 5.0     # §2: per-request timeout
CONTROL_TIMEOUT = 10.0    # §2/§10: reset, export, import
CONTROL_PATHS = ("/_test/reset", "/_test/export", "/_test/import")

PASSWORD = "correct horse"


# ---- fixtures in the §4 format ---------------------------------------------

def user(handle, balance, password=PASSWORD, **extra):
    u = {"id": f"u_{handle}", "email": f"{handle}@example.com", "password": password,
         "display_name": handle.capitalize(), "handle": handle, "balance": balance}
    u.update(extra)
    return u


def fixture(users=None, payments=None, requests=None, currency="EUR", minor_units=None,
            operators=None):
    units = {"EUR": 2, "JPY": 0, "BHD": 3}
    fx = {
        "currency": currency,
        "minor_units": units.get(currency, 2) if minor_units is None else minor_units,
        "users": users if users is not None else [
            user("ada", 10000), user("bob", 2500), user("cy", 500), user("dan", 0)],
        "payments": payments or [],
        "requests": requests or [],
    }
    if operators is not None:
        fx["settlement_operator_ids"] = operators
    return fx


def seeded_total(fx):
    return sum(u["balance"] for u in fx["users"])


def new_key():
    return "k-" + uuid.uuid4().hex


# ---- HTTP client -----------------------------------------------------------

class Api:
    """One client session. `token` is sent as a bearer token when set."""

    def __init__(self, base_url=BASE_URL, token=None):
        self.base_url = base_url
        self.token = token
        self.http = httpx.Client(base_url=base_url, timeout=REQUEST_TIMEOUT)

    def close(self):
        self.http.close()

    def request(self, method, path, json_body=None, content=None, key=None, headers=None,
                params=None, token=..., timeout=None):
        h = {}
        tok = self.token if token is ... else token
        if tok is not None:
            h["Authorization"] = f"Bearer {tok}"
        if key is not None:
            h["Idempotency-Key"] = key
        if json_body is not None or content is not None:
            h["Content-Type"] = "application/json; charset=utf-8"
        if headers:
            h.update(headers)
        if json_body is not None:
            content = json.dumps(json_body, ensure_ascii=False).encode("utf-8")
        if timeout is None:
            timeout = CONTROL_TIMEOUT if path.startswith(CONTROL_PATHS) else REQUEST_TIMEOUT
        resp = self.http.request(method, path, content=content, headers=h, params=params,
                                 timeout=timeout)
        assert resp.status_code < 500, (
            f"S1-073: {method} {path} gave {resp.status_code}: {resp.text[:300]}")
        return resp

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, body=None, **kw):
        return self.request("POST", path, json_body=body, **kw)

    # conveniences
    def me(self):
        return ok(self.get("/me"), 200)

    def balance(self):
        return self.me()["balance"]

    def pay(self, to, amount, key=None, **fields):
        body = {"to_handle": to, "amount": amount, **fields}
        return self.post("/payments", body, key=new_key() if key is None else key)

    def ask(self, payer, amount, key=None, note="n", **fields):
        body = {"payer_handle": payer, "amount": amount, "note": note, **fields}
        return self.post("/requests", body, key=new_key() if key is None else key)

    def pay_request(self, rid, body=None, key=None):
        return self.post(f"/requests/{rid}/pay", {} if body is None else body,
                         key=new_key() if key is None else key)

    def split(self, amount, handles, key=None, note="split", **fields):
        body = {"amount": amount, "participant_handles": handles, "note": note, **fields}
        return self.post("/splits", body, key=new_key() if key is None else key)

    def settle(self, transfers, key=None, **fields):
        return self.post("/settlements", {"transfers": transfers, **fields},
                         key=new_key() if key is None else key)

    def feed(self, **params):
        return ok(self.get("/activity", params={"limit": 200, **params}), 200)["payments"]

    def requests_list(self, **params):
        return ok(self.get("/requests", params={"limit": 200, **params}), 200)["requests"]

    def login(self, email, password=PASSWORD):
        return self.post("/auth/login", {"email": email, "password": password}, token=None)

    def signup(self, email, password=PASSWORD, display_name="New"):
        return self.post("/auth/signup", {"email": email, "password": password,
                                          "display_name": display_name}, token=None)


def ok(resp, status):
    assert resp.status_code == status, (
        f"expected {status}, got {resp.status_code}: {resp.text[:400]}")
    if status == 204:
        return None
    return resp.json()


def err(resp, status, code):
    """§5: status, code and the `{"error": {"code", "message"}}` body."""
    assert resp.status_code == status, (
        f"expected {status} {code}, got {resp.status_code}: {resp.text[:400]}")
    body = resp.json()
    assert isinstance(body, dict) and isinstance(body.get("error"), dict), body
    assert body["error"].get("code") == code, f"expected code {code}, got {body}"
    assert isinstance(body["error"].get("message"), str), body
    return body


def err_any(resp, choices):
    """One of several (status, code) pairs the requirements allow (decisions D6, D7, D9)."""
    got = (resp.status_code, None)
    try:
        body = resp.json()
        got = (resp.status_code, body["error"]["code"])
        assert isinstance(body["error"].get("message"), str)
    except Exception:
        pass
    assert got in choices, f"expected one of {choices}, got {got}: {resp.text[:300]}"


RFC3339 = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")


def assert_timestamp(value):
    """§3.4: RFC 3339 with an explicit offset (decision D2)."""
    assert isinstance(value, str) and RFC3339.match(value), f"not RFC 3339: {value!r}"
    datetime.fromisoformat(value.replace("Z", "+00:00"))


def ts(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def assert_id(value):
    assert isinstance(value, str) and 1 <= len(value) <= 64, f"bad id {value!r}"


def burst(fn, n, workers=50):
    """Run fn(i) for i in range(n) with up to `workers` in flight; return results."""
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(fn, range(n)))


# ---- pytest fixtures -------------------------------------------------------

class World:
    def __init__(self, fx, clients):
        self.fixture = fx
        self.clients = clients
        for k, v in clients.items():
            setattr(self, k, v)

    def total(self):
        return sum(c.balance() for c in self.clients.values())


@pytest.fixture
def api():
    made = []

    def make(token=None, base_url=BASE_URL):
        c = Api(base_url, token)
        made.append(c)
        return c

    yield make
    for c in made:
        c.close()


@pytest.fixture
def control(api):
    return api()


@pytest.fixture
def reset(control):
    def do(fx, expect=204):
        resp = control.post("/_test/reset", fx)
        if expect is None:
            return resp
        ok(resp, expect)
        return resp
    return do


def login_all(api, fx, base_url=BASE_URL):
    clients = {}
    for u in fx["users"]:
        c = api(base_url=base_url)
        c.token = ok(c.login(u["email"], u["password"]), 200)["token"]
        clients[u["handle"]] = c
    return clients


@pytest.fixture
def make_world(api, reset):
    def make(fx=None):
        fx = fx or fixture()
        reset(fx)
        return World(fx, login_all(api, fx))
    return make


@pytest.fixture
def world(make_world):
    """ada 10000, bob 2500, cy 500, dan 0 (EUR); no operators."""
    return make_world()


@pytest.fixture
def opworld(make_world):
    """As `world`, with ada as the only settlement operator."""
    return make_world(fixture(operators=["u_ada"]))


def conserve(world):
    """§1 invariants 1 and 2 over every wallet of the world."""
    balances = {h: c.balance() for h, c in world.clients.items()}
    assert all(b >= 0 for b in balances.values()), balances
    assert sum(balances.values()) == seeded_total(world.fixture), balances


# ---- extra containers (S1-016, S1-155) ---------------------------------------

def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def wait_healthy(url, limit=60.0):
    start = time.time()
    while time.time() - start < limit:
        try:
            r = httpx.get(url + "/health", timeout=2)
            if r.status_code == 200:
                return time.time() - start
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    raise AssertionError(f"S1-018: {url} not healthy within {limit}s")


@pytest.fixture
def spawn():
    """Start another container of the image under test; yields a function -> base URL."""
    if not IMAGE_TAG:
        pytest.skip("IMAGE_TAG not set: run through work/acceptance/run.sh")
    names = []

    def start(port_env=True):
        name = f"{RUN_ID}-x{len(names)}-{uuid.uuid4().hex[:6]}"
        host = free_port()
        inner = 8080 if not port_env else 9555
        cmd = ["docker", "run", "-d", "--name", name, "--label",
               f"pocketful-acceptance={RUN_ID}", "--cpus", "2", "--memory", "2g",
               "-p", f"127.0.0.1:{host}:{inner}"]
        if port_env:
            cmd += ["-e", f"PORT={inner}"]
        subprocess.run(cmd + [IMAGE_TAG], check=True, capture_output=True)
        names.append(name)
        url = f"http://127.0.0.1:{host}"
        wait_healthy(url)
        return url

    yield start
    for n in names:
        subprocess.run(["docker", "rm", "-f", n], capture_output=True)
