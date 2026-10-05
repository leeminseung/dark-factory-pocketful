// POST /auth/signup, POST /auth/login (§6) and GET /me (§8).
import { emailTaken, handleTaken, invalid, unauthenticated } from '../errors.js';
import { hashPassword, verifyNothing, verifyPassword } from '../passwords.js';
import { EMAIL_PATTERN, charCount, requiredString } from '../validate.js';
import { meView, sessionView } from '../views.js';

const MIN_PASSWORD_CHARS = 8;

/** §4: the email's local part, lowercased, non-[a-z0-9_] replaced by "_", cut to 20 characters. */
export function deriveHandle(email) {
  const local = email.slice(0, email.lastIndexOf('@'));
  return local.toLowerCase().replace(/[^a-z0-9_]/gu, '_').slice(0, 20);
}

function checkAvailable(state, email, handle) {
  if (state.userByEmail(email)) throw emailTaken();
  if (state.userByHandle(handle)) throw handleTaken();
}

export async function signup({ state, body }) {
  const email = requiredString(body, 'email');
  const password = requiredString(body, 'password');
  const displayName = requiredString(body, 'display_name');
  if (!EMAIL_PATTERN.test(email)) throw invalid('email must be of the form local@domain');
  if (charCount(password) < MIN_PASSWORD_CHARS) {
    throw invalid(`password must be at least ${MIN_PASSWORD_CHARS} characters`);
  }
  const handle = deriveHandle(email);
  checkAvailable(state, email, handle);
  const passwordHash = await hashPassword(password);
  // Another signup may have taken the email or handle while the hash was computed.
  checkAvailable(state, email, handle);
  const user = {
    id: state.newId('u', (id) => state.users.has(id)),
    email, passwordHash, displayName, handle, balance: 0,
  };
  state.addUser(user);
  return { status: 201, body: sessionView(user, state.issueToken(user.id)) };
}

export async function login({ state, body }) {
  const email = requiredString(body, 'email');
  const password = requiredString(body, 'password');
  const user = state.userByEmail(email);
  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyNothing(password);
  if (!ok) throw unauthenticated('wrong email or password');
  return { status: 200, body: sessionView(user, state.issueToken(user.id)) };
}

export function me({ state, user }) {
  return { status: 200, body: meView(state, user) };
}
