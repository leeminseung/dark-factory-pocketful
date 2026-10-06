// Shared pieces of every screen (design.md §2, §5, §6): fields, buttons, feedback lines,
// status chips, avatar plates, placeholders, empty states, and the retry identity of a write.
import { h, uid } from './dom.js';
import { newKey } from './api.js';
import { hatchSwatch, icon } from './icons.js';

/** A labelled input (or select). Returns { el, input }. The label is visible text above it. */
export function field({ label, testid, hint, value = '', type = 'text', inputmode, suffix, options, autocomplete, onInput }) {
  const id = uid(testid);
  const hintId = hint ? `${id}-hint` : null;
  const input = options
    ? h('select', { id, testid, class: 'input', 'aria-describedby': hintId, onchange: onInput },
      options.map(([v, text]) => h('option', { value: v }, text)))
    : h('input', {
      id, testid, type, class: 'input', value, inputmode, autocomplete, spellcheck: 'false',
      'aria-describedby': hintId, oninput: onInput,
    });
  const control = suffix ? h('div', { class: 'with-suffix' }, input, h('span', { class: 'suffix' }, suffix)) : input;
  return {
    input,
    el: h('div', { class: 'field' },
      h('label', { for: id }, label),
      hint && h('p', { class: 'hint', id: hintId }, hint),
      control),
  };
}

/**
 * A button that shows its busy label while `busy` is true, keeping its width. `busyIcon` is the
 * icon that turns while busy: a spinner by default, or the button's own glyph (Refresh).
 */
export function button({ label, busyLabel, testid, variant = 'primary', onClick, type = 'button', busyIcon = null }) {
  const text = h('span', { class: 'button-text' }, label);
  const turning = busyIcon ?? icon('spinner', 'spin');
  const el = h('button', { type, testid, class: `button ${variant}`, onclick: onClick }, turning, text);
  return {
    el,
    setLabel(next) { text.textContent = next; },
    busy(on) {
      el.disabled = on;
      el.classList.toggle('is-busy', on);
      el.setAttribute('aria-busy', on ? 'true' : 'false');
      text.textContent = on ? busyLabel : label;
    },
  };
}

const FEEDBACK = {
  success: { icon: 'check', role: 'status' },
  refused: { icon: 'cross', role: 'alert' },
  uncertain: { icon: 'question', role: 'status' },
};

/** A feedback line under the control that caused it: success, refused or uncertain. */
export const feedback = (kind, testid, text) => h('div', {
  class: `feedback ${kind}`, testid, role: FEEDBACK[kind].role,
}, icon(FEEDBACK[kind].icon), h('span', {}, text));

const CHIPS = {
  pending: ['Waiting', 'ring', 'chip-pending'],
  paid: ['Paid', 'check', 'chip-success'],
  declined: ['Declined', 'slashed', 'chip-neutral'],
  cancelled: ['Cancelled', 'minus', 'chip-neutral'],
  open: ['Held', null, 'chip-held'],
  captured: ['Collected', 'check', 'chip-success'],
  voided: ['Released', 'returnArrow', 'chip-neutral'],
  expired: ['Expired', 'hourglass', 'chip-neutral'],
};

/** A status chip: icon plus word, on a solid tint (design.md §6). */
export function chip(status) {
  const [word, iconName, className] = CHIPS[status];
  return h('span', { class: `chip ${className}` }, iconName ? icon(iconName) : hatchSwatch(), word);
}

/** A handle as text that never breaks inside the word (design.md §5). */
export const handleText = (handle, className = '') => h('span', { class: `handle ${className}`.trim() }, handle);

/** Privacy marker: padlock "Private" or people "Public". */
export const privacy = (visibility) => (visibility === 'private'
  ? h('span', { class: 'privacy private' }, icon('lock'), 'Private')
  : h('span', { class: 'privacy public' }, icon('people'), 'Public'));

/** The 40 px avatar plate: the other party's first two handle characters and a direction glyph. */
export const plate = (handle, direction, { held = false } = {}) => h('span', {
  class: `plate${held ? ' plate-held' : ''}`, 'aria-hidden': 'true',
}, handle.slice(0, 2).toUpperCase(), direction && h('span', { class: 'plate-glyph', data: { glyph: direction } }, icon(direction)));

/** A plum strip's loading state: "Loading…" at the height its figures will have (design.md §4). */
export const stripLoading = () => [
  h('p', { class: 'strip-label', role: 'status' }, 'Loading…'),
  h('p', { class: 'strip-figure strip-placeholder', 'aria-hidden': 'true' }, '\u00a0'),
];

/** "Loading …" above three placeholder rows of row height. */
export const loadingRows = (text) => h('div', { class: 'loading', role: 'status' },
  h('p', { class: 'meta' }, text),
  [1, 2, 3].map(() => h('div', { class: 'placeholder-row' })));

/** An empty state: title, body and one action link. */
export const emptyState = ({ testid, title, body, action, href, onAction }) => h('div', { class: 'empty', testid },
  h('p', { class: 'empty-title' }, title),
  h('p', {}, body),
  h('a', { href, class: 'link', onclick: onAction }, action));

/**
 * The retry identity of one write (stage-1 §7; stage 2 "Retries follow §7", ruling 63ae1ef).
 * The key belongs to the body last sent:
 * - submitting again with no field changed reuses it (a replay: money moves at most once);
 * - after a confirmed answer (`settle`: success or refusal), changing any field starts a new key
 *   for the next submission, even if the value is changed back ("Changing a field makes the next
 *   submission a new payment request");
 * - while the answer is unknown, a form restored to the sent body keeps its key ("Keep the
 *   unchanged form retryable with the same key and body"); a different body gets a new key.
 */
export class RetryIdentity {
  constructor() {
    this.body = null;
    this.key = null;
    this.settled = false;
  }

  /** The key for sending `bodyText` (the body as JSON text). */
  current(bodyText) {
    if (bodyText !== this.body) {
      this.body = bodyText;
      this.key = newKey();
      this.settled = false;
    }
    return this.key;
  }

  /** The service answered the last send: it succeeded or was refused. */
  settle() { this.settled = true; }

  /** A field changed. After a confirmed answer that ends this identity. */
  edited() {
    if (!this.settled) return;
    this.body = null;
    this.key = null;
    this.settled = false;
  }

  /** True when `bodyText` is the body last sent, so sending it would be a retry. */
  matches(bodyText) { return this.body !== null && bodyText === this.body; }
}

/**
 * Latest read wins (stage 2): each read gets a number when it starts; its response is applied
 * only if no later-numbered read has been applied already, so a delayed earlier read can never
 * overwrite a newer one, whatever order the responses arrive in.
 */
export class LatestRead {
  constructor() {
    this.issued = 0;
    this.applied = 0;
  }

  /** Numbers a read that is starting. */
  begin() {
    this.issued += 1;
    return this.issued;
  }

  /** True, and recorded, when read `seq` may be applied. */
  accept(seq) {
    if (seq < this.applied) return false;
    this.applied = seq;
    return true;
  }

  /** True when `seq` is the newest read started. */
  isLatest(seq) { return seq === this.issued; }
}
