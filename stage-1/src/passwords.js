// Password hashing (§6): scrypt with a per-password random salt. Plaintext is never stored.
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 32;

const derive = (password, salt, params) =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_BYTES, params, (err, key) => (err ? reject(err) : resolve(key))));

/** Returns "scrypt$N$r$p$salt$key" with base64url salt and key. */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  const { N, r, p } = PARAMS;
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

const HASH_FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

export const isPasswordHash = (value) =>
  typeof value === 'string' && HASH_FORMAT.test(value) && parseParams(value) !== null;

function parseParams(hash) {
  const [, N, r, p, salt, key] = HASH_FORMAT.exec(hash);
  const params = { N: Number(N), r: Number(r), p: Number(p) };
  // Accept only parameters this service could have produced, so an imported hash
  // cannot make verification fail or exhaust memory.
  if (params.N !== PARAMS.N || params.r !== PARAMS.r || params.p !== PARAMS.p) return null;
  return { params, salt: Buffer.from(salt, 'base64url'), key: Buffer.from(key, 'base64url') };
}

/** True when `password` matches `hash`. */
export async function verifyPassword(password, hash) {
  const { params, salt, key } = parseParams(hash);
  const candidate = await derive(password, salt, params);
  return candidate.length === key.length && timingSafeEqual(candidate, key);
}

/** Spends the same work as a verification, so an unknown email is not faster to reject. */
export async function verifyNothing(password) {
  await derive(password, Buffer.alloc(16), PARAMS);
  return false;
}
