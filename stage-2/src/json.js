// Reading and comparing JSON values (§3.4, §4, §7).
//
// JSON.parse reads numbers as doubles, which silently rounds some of them: 1.0000000000000001
// and 9007199254740993 both come back as integers they are not. §4 requires an amount to have
// an integral value and forbids rounding, so a number whose double is an integer different
// from the value written is kept as an InexactNumber. It is not a JSON number to any field
// rule, so it fails every amount and balance check.
import { malformed } from './errors.js';

/** A number token whose exact value is not the integer JSON.parse would round it to. */
export class InexactNumber {
  constructor(source) {
    this.source = source;
  }
}

const NUMBER_TOKEN = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** True when the token's double is an integer that differs from the token's exact value. */
function roundsToAnotherInteger(source) {
  const value = Number(source);
  if (!Number.isInteger(value)) return false; // non-integers already fail every integer rule
  const [, whole, fraction = '', exponent = '0'] = NUMBER_TOKEN.exec(source);
  let digits = (whole + fraction).replace(/^0+/, '');
  let scale = Number(exponent) - fraction.length; // exact value = digits * 10^scale
  if (digits === '') return false; // zero
  while (scale < 0 && digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    scale += 1;
  }
  if (scale < 0) return true; // a fractional part remains
  const exact = BigInt(digits) * 10n ** BigInt(scale);
  return exact !== (value < 0 ? -BigInt(value) : BigInt(value));
}

const TOKENS = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/** True when some number in valid JSON `text` would be rounded to a different integer. */
function hasRoundedInteger(text) {
  for (const [token] of text.matchAll(TOKENS)) {
    if (token[0] !== '"' && roundsToAnotherInteger(token)) return true;
  }
  return false;
}

/**
 * Parses JSON text; text that does not parse is 400 malformed_request. Numbers that would
 * round to a different integer become InexactNumber. The second, reviver-based parse runs
 * only when such a number exists, so ordinary deeply nested bodies never need it.
 */
export function parseJson(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw malformed('request body is not valid JSON');
  }
  if (!hasRoundedInteger(text)) return value;
  try {
    return JSON.parse(text, (key, parsed, context) =>
      (typeof parsed === 'number' && roundsToAnotherInteger(context.source)
        ? new InexactNumber(context.source) : parsed));
  } catch {
    throw malformed('request body is nested too deeply to read exactly');
  }
}

/** Text already in canonical form, waiting on the work stack of canonicalJson. */
class Literal {
  constructor(text) {
    this.text = text;
  }
}

/**
 * The same JSON value gives the same text: object keys are sorted, whitespace dropped.
 * Iterative, so a body nested 100000 levels deep cannot overflow the call stack.
 */
export function canonicalJson(root) {
  const out = [];
  const pending = [root]; // a stack: JSON values still to write, and Literal text
  const pushInOrder = (parts) => {
    for (let i = parts.length - 1; i >= 0; i -= 1) pending.push(parts[i]);
  };
  while (pending.length > 0) {
    const item = pending.pop();
    if (item instanceof Literal) {
      out.push(item.text);
    } else if (item instanceof InexactNumber) {
      out.push(item.source);
    } else if (Array.isArray(item)) {
      const parts = [new Literal('[')];
      item.forEach((element, i) => {
        if (i > 0) parts.push(new Literal(','));
        parts.push(element);
      });
      parts.push(new Literal(']'));
      pushInOrder(parts);
    } else if (item !== null && typeof item === 'object') {
      const parts = [new Literal('{')];
      Object.keys(item).sort().forEach((key, i) => {
        parts.push(new Literal(`${i > 0 ? ',' : ''}${JSON.stringify(key)}:`), item[key]);
      });
      parts.push(new Literal('}'));
      pushInOrder(parts);
    } else {
      out.push(JSON.stringify(item));
    }
  }
  return out.join('');
}
