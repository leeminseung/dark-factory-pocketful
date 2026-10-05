// Password hashing (§6). Plaintext is never stored.
//
// A stored hash is "scrypt$N$r$p$salt$userSalt$mac": K = scrypt(password, salt) and
// mac = HMAC-SHA256(K, userSalt). Verifying a password costs one scrypt at the stored N.
//
// Signup always hashes at full strength (N = FULL_N). A reset must fit 10 s for any number of
// seeded users (§2, S1-013), so it hashes the fixture as one batch:
// - equal passwords in the batch share one scrypt derivation (with their own userSalt and mac);
// - the batch's N is the largest power of two, from FULL_N down to MIN_N, at which the batch fits
//   SEED_BUDGET_MS on HASH_CONCURRENCY workers, from a cost measured on this machine at startup;
// - a seeded hash below FULL_N is replaced with a full-strength one at that user's first login.
// Trade-off: until a seeded user first logs in, their stored hash is cheaper to attack than a
// signup's, and users seeded with the same password share its scrypt salt. Each stays a salted
// scrypt hash, and no plaintext is kept.
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const FULL_N = 16384;
const MIN_N = 256;
const R = 8;
const P = 1;
const KEY_BYTES = 32;
const HASH_CONCURRENCY = 2; // the service's CPU budget (§2: 2 vCPU)
const SEED_BUDGET_MS = 4000; // of the 10 s reset limit, leaving room for parsing and slower runs

const derive = (password, salt, N) =>
  new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_BYTES, { N, r: R, p: P }, (err, key) => (err ? reject(err) : resolve(key))));

// Milliseconds one full-strength derivation takes here; measured once at startup.
let fullCostMs = 25;
const calibrating = (async () => {
  const started = performance.now();
  await derive('calibration', Buffer.alloc(16), FULL_N);
  fullCostMs = Math.max(1, performance.now() - started);
})();

/** The largest N from FULL_N down to MIN_N at which `count` derivations fit the seeding budget. */
function seedCost(count) {
  let N = FULL_N;
  while (N > MIN_N && (count * fullCostMs * (N / FULL_N)) / HASH_CONCURRENCY > SEED_BUDGET_MS) N /= 2;
  return N;
}

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

async function hashBatch(passwords, N) {
  const distinct = [...new Set(passwords)];
  const derived = await mapLimited(distinct, HASH_CONCURRENCY, async (password) => {
    const salt = randomBytes(16);
    return { salt, key: await derive(password, salt, N) };
  });
  const byPassword = new Map(distinct.map((password, i) => [password, derived[i]]));
  return passwords.map((password) => {
    const { salt, key } = byPassword.get(password);
    const userSalt = randomBytes(16);
    return ['scrypt', N, R, P, b64(salt), b64(userSalt), b64(mac(key, userSalt))].join('$');
  });
}

/** One password at full strength (signup, and the upgrade at a seeded user's first login). */
export const hashPassword = async (password) => (await hashBatch([password], FULL_N))[0];

/** A reset's passwords, at the strongest cost that fits the seeding budget. */
export async function hashSeededPasswords(passwords) {
  await calibrating;
  return hashBatch(passwords, seedCost(new Set(passwords).size));
}

const HASH_FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

function parseHash(hash) {
  const match = typeof hash === 'string' && HASH_FORMAT.exec(hash);
  if (!match) return null;
  const [, N, r, p, salt, userSalt, digest] = match;
  // Accept only parameters this service produces, so an imported hash cannot make
  // verification fail or exhaust memory.
  const n = Number(N);
  const isProducedN = n >= MIN_N && n <= FULL_N && (n & (n - 1)) === 0;
  if (!isProducedN || Number(r) !== R || Number(p) !== P) return null;
  return {
    N: n,
    salt: Buffer.from(salt, 'base64url'),
    userSalt: Buffer.from(userSalt, 'base64url'),
    digest: Buffer.from(digest, 'base64url'),
  };
}

export const isPasswordHash = (value) => parseHash(value) !== null;

/** True when `hash` is a seeded hash below full strength, to be replaced at the next login. */
export const needsUpgrade = (hash) => parseHash(hash).N < FULL_N;

/** True when `password` matches `hash`. */
export async function verifyPassword(password, hash) {
  const { N, salt, userSalt, digest } = parseHash(hash);
  const candidate = mac(await derive(password, salt, N), userSalt);
  return candidate.length === digest.length && timingSafeEqual(candidate, digest);
}

/** Spends the same work as a verification, so an unknown email is not faster to reject. */
export async function verifyNothing(password) {
  await derive(password, Buffer.alloc(16), FULL_N);
  return false;
}
