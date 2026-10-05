// What a refusal says to a person (design.md §5, §7). One place for every error code's words.
// The wording depends only on the error `code` and on what the person sent: stage-1 §5 lets
// the service's message use any wording, so it is shown only for codes with no words here.
import { formatAmount } from './money.js';
import {
  EMAIL_PATTERN, MAX_AMOUNT, MAX_NOTE_CHARS, MIN_PASSWORD_CHARS, charCount, deriveHandle,
} from '../shared/rules.js';

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

/** The words for a refused signup or login, from its code and what was typed. */
export function authRefusal(result, { email, password = '' }) {
  switch (result.code) {
    case 'email_taken':
      return 'An account with this email already exists. Log in instead.';
    case 'handle_taken':
      return `The handle ${deriveHandle(email)} is already taken, so this email can't be used. Try another email.`;
    case 'unauthenticated':
      return "That email and password don't match an account. Check both and try again.";
    case 'validation_failed':
      // In the order the service checks them: the email's form, then the password's length.
      return EMAIL_PATTERN.test(email) && charCount(password) < MIN_PASSWORD_CHARS
        ? `Use a password of at least ${MIN_PASSWORD_CHARS} characters.`
        : 'Enter an email like name@example.com.';
    default:
      return `${sentence(result.message)} Check the details and try again.`;
  }
}

/** The words for a refused collection or release of reserved money (design.md §5.6). */
export function reservationRefusal(result, { money, amount, remaining }) {
  const fmt = (minor) => formatAmount(minor, money);
  switch (result.code) {
    case 'validation_failed':
      return `Enter an amount from ${fmt(1)} to ${fmt(remaining)}.`;
    case 'capture_exceeds_authorization':
      return `Couldn't collect ${fmt(amount)}. Only ${fmt(remaining)} is left to collect.`;
    case 'authorization_expired':
      return "This reservation has expired, so it can't be collected. The list has been updated.";
    case 'authorization_not_open':
      return 'This reservation is no longer open. The list has been updated.';
    default:
      return `${sentence(result.message)} The list has been updated.`;
  }
}

/** The words for a refused split, from its code and the handles that were sent. */
export function splitRefusal(result, { handles }) {
  let reason;
  if (result.code === 'not_found') {
    reason = handles.length === 1
      ? `No one has the handle ${handles[0]}. Check the list.`
      : `One of these handles doesn't belong to anyone: ${handles.join(', ')}. Check the list.`;
  } else if (result.code === 'validation_failed' && handles.length === 0) {
    reason = 'Add at least one handle.';
  } else if (result.code === 'validation_failed' && new Set(handles).size !== handles.length) {
    reason = 'Each handle can appear only once.';
  } else {
    reason = sentence(result.message);
  }
  return `Split not sent. ${reason}`;
}

/** The uncertain line for a write whose answer was lost (design.md §5.2 for a payment). */
export const uncertainAbout = (what) => `We didn't get an answer about this ${what}, so it may or may not have gone through. `
  + `Retrying is safe: it repeats the same ${what}, so ${what === 'payment' ? 'money moves' : 'it happens'} at most once.`;
