// The equal-split rule (stage-1 §9), shared by the server (handlers/splits.js) and the
// browser's split preview (served as /assets/shares.js), so both compute the same shares.

/** Whole units summing to `total`, differing by at most one; the first ones get the extra units. */
export function equalShares(total, count) {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
