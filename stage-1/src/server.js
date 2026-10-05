// HTTP plumbing: body reading, authentication, the idempotency wrapper and error responses.
import http from 'node:http';
import { ApiError, forbidden, malformed, notFound, unauthenticated } from './errors.js';
import { runIdempotent } from './idempotency.js';
import { matchRoute } from './routes.js';
import { store } from './state.js';
import { idempotencyKey, isPlainObject } from './validate.js';

const MAX_BODY_BYTES = 64 * 1024 * 1024; // room for an imported state
const JSON_TYPE = 'application/json; charset=utf-8';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(malformed('request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** A POST body must be a JSON object; an empty body counts as {}. */
function parseBody(text) {
  if (text.trim() === '') return {};
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw malformed('request body is not valid JSON');
  }
  if (!isPlainObject(value)) throw malformed('request body must be a JSON object');
  return value;
}

function authenticate(state, header) {
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header ?? '');
  const user = match && state.userForToken(match[1]);
  if (!user) throw unauthenticated();
  return user;
}

function decodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    throw notFound();
  }
}

async function dispatch(req) {
  const url = new URL(req.url, 'http://localhost');
  const text = await readBody(req);
  const matched = matchRoute(req.method, url.pathname);
  if (!matched) throw notFound(`no endpoint ${req.method} ${url.pathname}`);
  const { route } = matched;
  const params = Object.fromEntries(Object.entries(matched.params).map(([k, v]) => [k, decodePath(v)]));

  // One state for the whole request: a concurrent reset or import swaps in a new one
  // without changing the state this request reads and writes.
  const state = store.current;
  const user = route.auth ? authenticate(state, req.headers.authorization) : null;
  if (route.operator && !state.isOperator(user.id)) throw forbidden('settlement operators only');
  const key = route.idempotent ? idempotencyKey(req.headers['idempotency-key']) : null;
  const body = req.method === 'POST' ? parseBody(text) : {};
  const context = { state, user, body, params, query: url.searchParams };

  if (!route.idempotent) return route.handler(context);
  return runIdempotent(state, {
    userId: user.id, method: req.method, path: url.pathname, key, body,
  }, () => route.handler(context));
}

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': JSON_TYPE, 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function handle(req, res) {
  try {
    const { status, body } = await dispatch(req);
    send(res, status, body);
  } catch (err) {
    if (err instanceof ApiError) {
      send(res, err.status, { error: { code: err.code, message: err.message } });
      return;
    }
    console.error(err);
    send(res, 500, { error: { code: 'internal_error', message: 'internal error' } });
  }
}

export function createServer() {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });
  server.keepAliveTimeout = 65_000;
  return server;
}
