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

/** A button that shows its busy label and a spinner while `busy` is true, keeping its width. */
export function button({ label, busyLabel, testid, variant = 'primary', onClick, type = 'button' }) {
  const text = h('span', { class: 'button-text' }, label);
  const el = h('button', { type, testid, class: `button ${variant}`, onclick: onClick }, icon('spinner', 'spin'), text);
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

/** Privacy marker: padlock "Private" or people "Public". */
export const privacy = (visibility) => (visibility === 'private'
  ? h('span', { class: 'privacy private' }, icon('lock'), 'Private')
  : h('span', { class: 'privacy public' }, icon('people'), 'Public'));

/** The 40 px avatar plate: the other party's first two handle characters and a direction glyph. */
export const plate = (handle, direction, { held = false } = {}) => h('span', {
  class: `plate${held ? ' plate-held' : ''}`, 'aria-hidden': 'true',
}, handle.slice(0, 2).toUpperCase(), direction && h('span', { class: 'plate-glyph' }, icon(direction)));

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
 * The retry identity of one write (stage-1 §7, stage 2 "Retries follow §7"): the key belongs to
 * the body last sent. Sending the same body again — a resubmit, a retry after a lost response,
 * or a form edited and changed back — reuses it, so it is a replay and moves money at most once.
 * A different body gets a new key, so it is a new write.
 */
export class RetryIdentity {
  constructor() {
    this.body = null;
    this.key = null;
  }

  /** The key for sending `bodyText` (the body as JSON text). */
  current(bodyText) {
    if (bodyText !== this.body) {
      this.body = bodyText;
      this.key = newKey();
    }
    return this.key;
  }

  /** True when `bodyText` is the body last sent, so sending it would be a retry. */
  matches(bodyText) { return this.body !== null && bodyText === this.body; }
}
