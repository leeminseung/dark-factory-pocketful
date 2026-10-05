// The browser's API client and session.
//
// Every call resolves to one of three outcomes, so no screen has to guess:
//   { ok: true, status, body }             the write took effect (201) or replayed (200)
//   { refused: true, status, code, message } the service answered no (4xx)
//   { unknown: true }                       no usable answer: the network failed, the response
//                                           was lost or unreadable, or the service failed (5xx).
//                                           The write may or may not have happened.
const TOKEN_KEY = 'pocketful.token';

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  },
};

/** A fresh idempotency key. */
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/**
 * How long a read may go unanswered before it counts as lost. The service answers within 5 s
 * (stage-1 §2), so a read still waiting at 6 s will not be answered: it is asked once more. Reads
 * change nothing, so asking again is safe, a slow but live read is never doubled, and a screen is
 * never left waiting on an answer that will not come. Writes are never retried here; their retry
 * is the person's, with the same key (lib/ui.js RetryIdentity).
 */
export const READ_TIMEOUT_MS = 6000;
const READ_ATTEMPTS = 2;

/** One fetch: resolves to { response, parsed } or throws when there is no usable answer. */
async function exchange(method, path, headers, body, signal) {
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  const text = await response.text();
  return { response, parsed: text ? JSON.parse(text) : null };
}

export async function api(method, path, { body, key } = {}) {
  const headers = { Accept: 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (key) headers['Idempotency-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const isRead = method === 'GET';
  let answer = null;
  for (let attempt = 1; attempt <= (isRead ? READ_ATTEMPTS : 1) && !answer; attempt += 1) {
    try {
      answer = await exchange(method, path, headers, body, isRead ? AbortSignal.timeout(READ_TIMEOUT_MS) : undefined);
    } catch {
      answer = null;
    }
  }
  if (!answer) return { unknown: true };
  const { response, parsed } = answer;
  if (response.status >= 500) return { unknown: true };
  if (response.ok) return { ok: true, status: response.status, body: parsed };
  const error = parsed?.error ?? {};
  if (response.status === 401 && path !== '/auth/login') onSignedOut();
  return { refused: true, status: response.status, code: error.code ?? 'error', message: error.message ?? '' };
}

let signedOutHandler = () => {};
/** Called when the service no longer knows the token (for example after a reset). */
export const whenSignedOut = (handler) => { signedOutHandler = handler; };
function onSignedOut() {
  session.token = null;
  signedOutHandler();
}

const PAGE_LIMIT = 200; // the API's largest page (stage-1 §5)

/**
 * Reads a whole list page by page until has_more is false. `fetchPage(offset, limit)` resolves to
 * { ok, items, hasMore }; any failed page fails the whole read, so a screen never shows half a list.
 * Pages are read by offset, so a write by another client between two page reads can shift a row
 * onto the next page too: rows are kept once, by `idOf` ("One per visible payment").
 */
export async function collectPages(fetchPage, idOf) {
  const items = [];
  const seen = new Set();
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const page = await fetchPage(offset, PAGE_LIMIT);
    if (!page.ok) return { ok: false };
    for (const item of page.items) {
      const id = idOf(item);
      if (!seen.has(id)) {
        seen.add(id);
        items.push(item);
      }
    }
    if (!page.hasMore) return { ok: true, items };
  }
}

/** GET a whole list endpoint; `field` names its array and `idField` each row's id. */
export const readAll = (path, field, idField) => collectPages(async (offset, limit) => {
  const res = await api('GET', `${path}?limit=${limit}&offset=${offset}`);
  return res.ok ? { ok: true, items: res.body[field], hasMore: res.body.has_more } : { ok: false };
}, (row) => row[idField]);
