// POST /auth/signup, POST /auth/login (§6) and GET /me (§8).
import { emailTaken, handleTaken, invalid, unauthenticated } from '../errors.js';
import { hashPassword, needsUpgrade, verifyNothing, verifyPassword } from '../passwords.js';
import { charCount, isEmail } from '../model.js';
import { MIN_PASSWORD_CHARS, deriveHandle } from '../../public/assets/shared/rules.js';
import { requiredString } from '../validate.js';
import { meView, sessionView } from '../views.js';

export { deriveHandle };

function checkAvailable(state, email, handle) {
  if (state.userByEmail(email)) throw emailTaken();
  if (state.userByHandle(handle)) throw handleTaken();
}

export async function signup({ state, body }) {
  const email = requiredString(body, 'email');
  const password = requiredString(body, 'password');
  const displayName = requiredString(body, 'display_name');
  if (!isEmail(email)) throw invalid('email must be of the form local@domain');
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
    email, passwordHash, displayName, handle, balance: 0, openingBalance: 0, // new accounts open at zero
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
  // A seeded hash may be below full strength (passwords.js); replace it now that we hold the password.
  if (needsUpgrade(user.passwordHash)) user.passwordHash = await hashPassword(password);
  return { status: 200, body: sessionView(user, state.issueToken(user.id)) };
}

export function me({ state, user }) {
  return { status: 200, body: meView(state, user) };
}
