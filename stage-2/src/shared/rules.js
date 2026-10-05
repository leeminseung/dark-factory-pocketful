// Model rules the server and the browser both apply (served as /assets/shared/rules.js), so the
// screens' messages can never disagree with what the service enforces.

export const MAX_AMOUNT = 1_000_000_000;
export const MAX_NOTE_CHARS = 200;
export const MIN_PASSWORD_CHARS = 8;

/** Characters, not UTF-16 units or bytes: an emoji counts once (stage-1 D5). */
export const charCount = (text) => [...text].length;

/** §4: the email's local part, lowercased, non-[a-z0-9_] replaced by "_", cut to 20 characters. */
export function deriveHandle(email) {
  const local = email.slice(0, email.lastIndexOf('@'));
  return local.toLowerCase().replace(/[^a-z0-9_]/gu, '_').slice(0, 20);
}
