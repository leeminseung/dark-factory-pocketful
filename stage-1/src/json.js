// Reading and comparing JSON values (§3.4, §7).
import { malformed } from './errors.js';

/** Parses JSON text; text that does not parse is 400 malformed_request. */
export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw malformed('request body is not valid JSON');
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
