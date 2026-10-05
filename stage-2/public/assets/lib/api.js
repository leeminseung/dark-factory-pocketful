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

export async function api(method, path, { body, key } = {}) {
  const headers = { Accept: 'application/json' };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (key) headers['Idempotency-Key'] = key;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  let parsed;
  try {
    response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return { unknown: true };
  }
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
