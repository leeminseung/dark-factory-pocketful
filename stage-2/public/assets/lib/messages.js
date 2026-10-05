// What a refusal says to a person (design.md §5, §7). One place for every error code's words.
import { formatAmount } from './money.js';
import { charCount } from './text.js';

const MAX_AMOUNT = 1_000_000_000;
const MAX_NOTE_CHARS = 200;

/**
 * The words for a refused money write (pay, request, reserve).
 * `verb` is the refusal's first word ("Not sent", "Not reserved"); `form` holds what was sent.
 */
export function moneyRefusal(result, { money, available, amount, handle, note, verb = 'Not sent', kind = 'payment' }) {
  const fmt = (minor) => formatAmount(minor, money);
  switch (result.code) {
    case 'insufficient_funds':
      return kind === 'reservation'
        ? `${verb}. You have ${fmt(available)} available to spend.`
        : `${verb}. You have ${fmt(available)} available to spend and this ${kind} is ${fmt(amount)}. Lower the amount or wait for held money to be released.`;
    case 'not_found':
      return `No one has the handle ${handle}. Check the spelling.`;
    case 'self_payment':
    case 'self_request':
      return "That's your own handle. Enter someone else's.";
    case 'validation_failed':
      if (charCount(note ?? '') > MAX_NOTE_CHARS) return 'Keep the note to 200 characters or fewer.';
      return `Enter an amount between ${fmt(1)} and ${fmt(MAX_AMOUNT)}.`;
    default:
      return `${verb}. ${sentence(result.message)} Check the details and try again.`;
  }
}

/** The service's message as a sentence. */
export const sentence = (text) => {
  const trimmed = (text || 'The service refused it').trim();
  const capital = trimmed[0].toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

/** The words for a refused signup or login. */
export function authRefusal(result, { email }) {
  switch (result.code) {
    case 'email_taken':
      return 'An account with this email already exists. Log in instead.';
    case 'handle_taken':
      return `The handle ${derivedHandle(email)} is already taken, so this email can't be used. Try another email.`;
    case 'unauthenticated':
      return "That email and password don't match an account. Check both and try again.";
    case 'validation_failed':
      return /password/i.test(result.message)
        ? 'Use a password of at least 8 characters.'
        : 'Enter an email like name@example.com.';
    default:
      return `${sentence(result.message)} Check the details and try again.`;
  }
}

/** The handle signup would give this email (stage-1 §4), for the handle_taken message only. */
const derivedHandle = (email) => email.slice(0, email.lastIndexOf('@')).toLowerCase()
  .replace(/[^a-z0-9_]/gu, '_').slice(0, 20);

/** The uncertain line for a write whose answer was lost (design.md §5.2 for a payment). */
export const uncertainAbout = (what) => `We didn't get an answer about this ${what}, so it may or may not have gone through. `
  + `Retrying is safe: it repeats the same ${what}, so ${what === 'payment' ? 'money moves' : 'it happens'} at most once.`;
