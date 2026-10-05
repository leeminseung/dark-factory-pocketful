// Amounts as people read and type them (stage 2 "Formatted amount").
// The API speaks integer minor units; people see and type decimals.

/** `100.00 EUR`; with minor_units 0 there is no decimal point: `1200 JPY`. Never a sign. */
export function formatAmount(minor, { minorUnits, currency }) {
  const digits = String(minor);
  if (minorUnits === 0) return `${digits} ${currency}`;
  const padded = digits.padStart(minorUnits + 1, '0');
  return `${padded.slice(0, -minorUnits)}.${padded.slice(-minorUnits)} ${currency}`;
}

/** The decimal form of a minor-unit amount without the code, for prefilled inputs: `25.00`. */
export const decimalOf = (minor, money) => formatAmount(minor, money).split(' ')[0];

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/**
 * Minor units for a typed decimal, or null when it is not a plain decimal or has more
 * places than the currency allows: with minor_units 2, `15`, `15.0` and `15.00` are 1500,
 * `15.5` is 1550, and `15.005`, `15,00`, `1e3` and `` are null. Nothing is ever rounded.
 */
export function parseAmount(text, { minorUnits }) {
  const match = DECIMAL.exec(text.trim());
  if (!match) return null;
  const [, whole, fraction = ''] = match;
  if (fraction.length > minorUnits) return null;
  if (minorUnits === 0 && text.includes('.')) return null;
  const minor = Number(whole + fraction.padEnd(minorUnits, '0'));
  return Number.isSafeInteger(minor) ? minor : null;
}

/** The form's message for a typed amount that is not one (design.md §5). */
export function amountHint({ minorUnits }) {
  if (minorUnits === 0) return 'Enter a whole amount like 1200, with no decimal point.';
  return `Enter an amount like 15.${'0'.repeat(minorUnits)}, with up to ${minorUnits} decimal places.`;
}
