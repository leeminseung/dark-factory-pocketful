// HTTP plumbing: body reading, authentication, the idempotency wrapper and error responses.
import http from 'node:http';
import { ApiError, forbidden, malformed, notFound, unauthenticated } from './errors.js';
import { runIdempotent } from './idempotency.js';
import { parseJson } from './json.js';
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
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * A POST body must be UTF-8 JSON text of an object (§3.4); an empty body, invalid UTF-8
 * or anything else that does not parse is 400 malformed_request (§5).
 */
function parseBody(bytes) {
  let text;
  try {
    text = UTF8.decode(bytes);
  } catch {
    throw malformed('request body is not valid UTF-8');
  }
  const value = parseJson(text);
  if (!isPlainObject(value)) throw malformed('request body must be a JSON object');
  return value;
}

/** Node decodes header bytes as latin1; clients send UTF-8, so decode them again to count characters. */
const utf8Header = (value) => (value === undefined ? undefined : Buffer.from(value, 'latin1').toString('utf8'));

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
  const bytes = await readBody(req);
  const matched = matchRoute(req.method, url.pathname);
  if (!matched) throw notFound(`no endpoint ${req.method} ${url.pathname}`);
  const { route } = matched;
  const params = Object.fromEntries(Object.entries(matched.params).map(([k, v]) => [k, decodePath(v)]));

  // One state for the whole request: a concurrent reset or import swaps in a new one
  // without changing the state this request reads and writes.
  const state = store.current;
  // Expiry needs no request at the deadline: every request first closes what is due, so
  // all its reads and writes see the clock (stage 2 "Reads and writes must reflect expiry").
  state.expireDue(Date.now());
  const user = route.auth ? authenticate(state, req.headers.authorization) : null;
  if (route.operator && !state.isOperator(user.id)) throw forbidden('settlement operators only');
  const key = route.idempotent ? idempotencyKey(utf8Header(req.headers['idempotency-key'])) : null;
  const bodyAbsent = req.method !== 'POST' || (route.noBody && bytes.length === 0);
  const body = bodyAbsent ? {} : parseBody(bytes);
  const context = { state, user, body, params, query: url.searchParams };

  // The endpoint is the matched route and its decoded parameters, not the raw spelling:
  // `/payments/` and `/requests/rq%5F1/pay` are the same paths as `/payments` and `/requests/rq_1/pay`.
  const run = route.idempotent
    ? () => runIdempotent(state, {
      userId: user.id, method: req.method, route: route.path, params, key, body,
    }, () => route.handler(context))
    : () => route.handler(context);
  // A synchronous handler runs as one transaction: if it throws, whatever it changed is
  // undone, so no failure (4xx or 5xx) leaves money moved or a key recorded.
  return route.handler.constructor.name === 'AsyncFunction' ? run() : state.transaction(run);
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

const MAX_HEADER_BYTES = 1024 * 1024;

/**
 * A request Node cannot parse (headers over MAX_HEADER_BYTES, a broken request line) never
 * reaches `handle`; answer it here so it still gets the §5 error body.
 */
function refuseUnparseable(err, socket) {
  if (!socket.writable) return;
  const tooLarge = err.code === 'HPE_HEADER_OVERFLOW';
  const payload = JSON.stringify({ error: {
    code: 'malformed_request',
    message: tooLarge ? 'request headers are too large' : 'request could not be parsed',
  } });
  socket.end([
    `HTTP/1.1 ${tooLarge ? '431 Request Header Fields Too Large' : '400 Bad Request'}`,
    `Content-Type: ${JSON_TYPE}`,
    `Content-Length: ${Buffer.byteLength(payload)}`,
    'Connection: close',
    '',
    payload,
  ].join('\r\n'));
}

export function createServer() {
  const server = http.createServer({ maxHeaderSize: MAX_HEADER_BYTES }, (req, res) => {
    handle(req, res);
  });
  server.on('clientError', refuseUnparseable);
  server.keepAliveTimeout = 65_000;
  return server;
}
