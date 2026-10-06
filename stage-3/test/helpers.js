// Test helpers: an in-process server on a free port and a small JSON client.
import { randomUUID } from 'node:crypto';
import { after, before } from 'node:test';
import { createServer } from '../src/server.js';

export const PASSWORD = 'correct horse';
/**
 * Timing bounds for tests: 80 % of the stated limits (§2: 10 s for reset, 5 s per request). Test
 * files run in parallel and share the CPU, so a bound tighter than the requirement is flaky.
 */
export const RESET_LIMIT_MS = 8_000;
export const REQUEST_LIMIT_MS = 4_000;
export const user = (handle, balance, extra = {}) => ({
  id: `u_${handle}`, email: `${handle}@example.com`, password: PASSWORD,
  display_name: handle[0].toUpperCase() + handle.slice(1), handle, balance, ...extra,
});
export const fixture = (over = {}) => ({
  currency: 'EUR', minor_units: 2,
  users: [user('ada', 10_000), user('bob', 2_500), user('cy', 500)],
  payments: [], requests: [], ...over,
});
export const newKey = () => randomUUID();
/** How every response writes an instant (§3.4): RFC 3339 in UTC with "+00:00", milliseconds or finer. */
export const RESPONSE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,}\+00:00$/;

/** Starts one server for the calling test file and returns its base URL getter. */
export function useServer() {
  const ctx = { base: null };
  let server;
  before(async () => {
    server = createServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    ctx.base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  }));
  return ctx;
}

/** Sends one request; `json` is serialised, `raw` is sent as is. Returns { status, body }. */
export async function call(base, method, path, { json, raw, token, key, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (key !== undefined) h['idempotency-key'] = key;
  let payload = raw;
  if (json !== undefined) {
    payload = JSON.stringify(json);
    h['content-type'] = 'application/json';
  }
  const res = await fetch(base + path, { method, headers: h, body: payload });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

/** Resets to `fx` and returns signed-in clients keyed by handle. */
export async function world(base, fx = fixture()) {
  const reset = await call(base, 'POST', '/_test/reset', { json: fx });
  if (reset.status !== 204) throw new Error(`reset failed: ${JSON.stringify(reset)}`);
  const clients = {};
  for (const u of fx.users) {
    const login = await call(base, 'POST', '/auth/login', { json: { email: u.email, password: u.password } });
    clients[u.handle] = client(base, login.body.token);
  }
  return clients;
}

export function client(base, token) {
  return {
    token,
    get: (path) => call(base, 'GET', path, { token }),
    post: (path, json, key) => call(base, 'POST', path, { token, json, key }),
    balance: async () => (await call(base, 'GET', '/me', { token })).body.balance,
  };
}

/** An export as the stage-2 service wrote it: without the fields stage 3 added. */
export function asStage2Export(envelope) {
  const { snapshots, ...s } = envelope.state;
  return {
    ...envelope,
    state: {
      ...s,
      users: s.users.map(({ opening_balance, ...u }) => u),
      payments: s.payments.map(({ revisions, ...p }) => p),
      authorizations: s.authorizations.map(({ closed_at_ms, ...a }) => a),
    },
  };
}

/** An export as the stage-1 service wrote it: without the fields stages 2 and 3 added. */
export function asStage1Export(envelope) {
  const { authorization_ttl_seconds, authorizations, ...s } = asStage2Export(envelope).state;
  return { ...envelope, state: { ...s, payments: s.payments.map(({ authorization_id, ...p }) => p) } };
}
