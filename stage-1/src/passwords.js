// Password hashing (§6). Plaintext is never stored.
//
// A stored hash is "scrypt$N$r$p$salt$userSalt$mac": K = scrypt(password, salt) and
// mac = HMAC-SHA256(K, userSalt). Verifying a password costs one scrypt.
//
// A reset can seed thousands of users, most with the same password, and a full scrypt per
// user overran the 10 s reset limit and starved concurrent logins (R16). So hashPasswords
// derives K once per distinct password in a batch, with a fresh salt for that password, and
// gives each user their own userSalt and mac. Users who share a password share the scrypt
// salt, which means cracking that password once cracks it for all of them. But their stored
// hashes differ, and each guess still costs a full scrypt. Distinct passwords still cost one
// scrypt each, run at most HASH_CONCURRENCY at a time so logins keep a worker free.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_BYTES = 32;
const HASH_CONCURRENCY = 2;

const derive = (password, salt, params) =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_BYTES, params, (err, key) => (err ? reject(err) : resolve(key))));

const mac = (key, userSalt) => createHmac('sha256', key).update(userSalt).digest();
const b64 = (buffer) => buffer.toString('base64url');

/** Runs `work` over `items`, at most `limit` at a time, keeping result order. */
async function mapLimited(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await work(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** Hashes each password; equal passwords in the batch share one scrypt derivation. */
export async function hashPasswords(passwords) {
  const distinct = [...new Set(passwords)];
  const derived = await mapLimited(distinct, HASH_CONCURRENCY, async (password) => {
    const salt = randomBytes(16);
    return { salt, key: await derive(password, salt, PARAMS) };
  });
  const byPassword = new Map(distinct.map((password, i) => [password, derived[i]]));
  const { N, r, p } = PARAMS;
  return passwords.map((password) => {
    const { salt, key } = byPassword.get(password);
    const userSalt = randomBytes(16);
    return ['scrypt', N, r, p, b64(salt), b64(userSalt), b64(mac(key, userSalt))].join('$');
  });
}

export const hashPassword = async (password) => (await hashPasswords([password]))[0];

const HASH_FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function parseHash(hash) {
  const match = typeof hash === 'string' && HASH_FORMAT.exec(hash);
  if (!match) return null;
  const [, N, r, p, salt, userSalt, digest] = match;
  // Accept only parameters this service produces, so an imported hash cannot make
  // verification fail or exhaust memory.
  if (Number(N) !== PARAMS.N || Number(r) !== PARAMS.r || Number(p) !== PARAMS.p) return null;
  return {
    salt: Buffer.from(salt, 'base64url'),
    userSalt: Buffer.from(userSalt, 'base64url'),
    digest: Buffer.from(digest, 'base64url'),
  };
}

export const isPasswordHash = (value) => parseHash(value) !== null;

/** True when `password` matches `hash`. */
export async function verifyPassword(password, hash) {
  const { salt, userSalt, digest } = parseHash(hash);
  const candidate = mac(await derive(password, salt, PARAMS), userSalt);
  return candidate.length === digest.length && timingSafeEqual(candidate, digest);
}

/** Spends the same work as a verification, so an unknown email is not faster to reject. */
export async function verifyNothing(password) {
  await derive(password, Buffer.alloc(16), PARAMS);
  return false;
}
