// `/authorizations` ("Reserved"): money held for others and money held for you to collect.
import { api } from '../lib/api.js';
import { fill, h } from '../lib/dom.js';
import { hatchSwatch } from '../lib/icons.js';
import { amountHint, decimalOf, formatAmount, parseAmount } from '../lib/money.js';
import { sentence, uncertainAbout } from '../lib/messages.js';
import { deadline, friendlyTime } from '../lib/time.js';
import { LatestRead, RetryIdentity, button, chip, emptyState, feedback, field, loadingRows, plate } from '../lib/ui.js';

const LIST_LIMIT = 200;

export function renderAuthorizations(ctx, main) {
  const { money } = ctx;
  const fmt = (minor) => formatAmount(minor, money);
  const mine = ctx.me.user_id;
  const state = { list: null, rowNote: null };
  const reads = new LatestRead();
  const identities = new Map(); // authorization id -> retry identity of its capture
  const captureInputs = new Map(); // authorization id -> typed amount, kept across refreshes

  const strip = h('section', { class: 'plum-strip', 'aria-label': 'Reserved money' });
  const status = h('div', { class: 'screen-feedback' });
  const body = h('div', {}, loadingRows('Loading reserved money…'));
  fill(main, h('h1', { class: 'page-title' }, 'Reserved money'), strip, status, body);

  async function load() {
    const seq = reads.begin();
    const res = await api('GET', `/authorizations?limit=${LIST_LIMIT}`);
    if (!ctx.view.alive) return;
    if (!res.ok) {
      fill(body, feedback('refused', null, "Couldn't load reserved money. Try again in a moment."));
      return;
    }
    if (!reads.accept(seq)) return;
    state.list = res.body.authorizations;
    render();
  }

  function render() {
    const open = state.list.filter((a) => a.status === 'open');
    const heldForOthers = open.filter((a) => a.from_user_id === mine).reduce((s, a) => s + a.remaining_amount, 0);
    const forYou = open.filter((a) => a.to_user_id === mine).reduce((s, a) => s + a.remaining_amount, 0);
    fill(strip, heldForOthers === 0 && forYou === 0
      ? h('p', { class: 'strip-line' }, 'Nothing is held right now.')
      : h('dl', { class: 'strip-figures' },
        h('div', {}, h('dt', {}, hatchSwatch(), 'Held for others'), h('dd', {}, fmt(heldForOthers))),
        h('div', {}, h('dt', {}, 'Ready for you to collect'), h('dd', {}, fmt(forYou)))));
    fill(body,
      state.list.length === 0 && emptyState({
        testid: 'empty-authorizations', title: 'Nothing reserved.',
        body: "Reserve money for someone and they can collect it when they're ready. Until then it stays yours, held aside.",
        action: 'Reserve money', href: '/#reserve',
      }),
      h('ol', { class: 'rows', testid: 'authorization-list' }, state.list.map(row)));
  }

  function row(a) {
    const outgoing = a.from_user_id === mine;
    const other = outgoing ? a.to_handle : a.from_handle;
    const open = a.status === 'open';
    const id = a.authorization_id;
    const note = state.rowNote?.id === id ? state.rowNote.el : null;
    return h('li', { class: 'row', testid: `authorization-item-${id}`, data: { status: a.status } },
      plate(other, outgoing ? 'sent' : 'received', { held: open }),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-head' },
          h('p', { class: 'row-title' }, outgoing ? `Reserved for ${other}` : `${other} reserved for you`),
          h('p', { class: 'row-amount', testid: `authorization-amount-${id}` }, fmt(a.amount))),
        a.note && h('p', { class: 'row-note' }, a.note),
        open && a.captured_amount > 0 && h('p', { class: 'meta' }, `Collected so far ${fmt(a.captured_amount)}`),
        h('p', { class: 'meta row-meta' }, chip(a.status), open && h('span', {}, `Collect by ${deadline(a.expires_at)}`)),
        h('p', { class: 'meta' }, 'Expires ', h('time', { datetime: a.expires_at, testid: `authorization-expires-${id}` }, a.expires_at)),
        a.status === 'captured' && h('p', { class: 'meta' }, 'Collected ', h('span', { class: 'amount-inline', testid: `authorization-captured-${id}` }, fmt(a.captured_amount))),
        a.status === 'voided' && h('p', { class: 'meta' }, `Released. The money went back to ${a.from_handle}.`),
        a.status === 'expired' && h('p', { class: 'meta' }, `Expired ${friendlyTime(a.expires_at)}. The money went back to ${a.from_handle}.`),
        open && !outgoing && captureControls(a),
        open && outgoing && h('div', { class: 'row-actions' }, voidButton(a)),
        note));
  }

  function captureControls(a) {
    const id = a.authorization_id;
    const amount = field({
      label: 'Amount to collect', testid: `authorization-capture-amount-${id}`, inputmode: 'decimal', suffix: money.currency,
      value: captureInputs.get(id) ?? decimalOf(a.remaining_amount, money), autocomplete: 'off',
      onInput: () => {
        captureInputs.set(id, amount.input.value);
        identities.get(id)?.edited();
      },
    });
    const control = button({ label: 'Collect', busyLabel: 'Collecting…', testid: `authorization-capture-${id}`, onClick: () => capture(a, amount, control) });
    return h('div', { class: 'capture' }, amount.el, h('div', { class: 'row-actions' }, control.el));
  }

  function voidButton(a) {
    const control = button({
      label: 'Release hold', busyLabel: 'Releasing…', testid: `authorization-void-${a.authorization_id}`, variant: 'outline',
      onClick: () => release(a, control),
    });
    return control.el;
  }

  async function capture(a, amount, control) {
    const id = a.authorization_id;
    state.rowNote = null;
    fill(status);
    const minor = parseAmount(amount.input.value, money);
    if (minor === null) {
      state.rowNote = { id, el: feedback('refused', 'authorization-error', amountHint(money)) };
      render();
      return;
    }
    if (!identities.has(id)) identities.set(id, new RetryIdentity());
    control.busy(true);
    const body = { amount: minor };
    const result = await api('POST', `/authorizations/${encodeURIComponent(id)}/capture`, { body, key: identities.get(id).current(JSON.stringify(body)) });
    if (!result.unknown) identities.get(id).settle();
    await settle(a, result, `Collected ${fmt(minor)}.`, (refused) => {
      if (refused.code === 'capture_exceeds_authorization') {
        return `Couldn't collect ${fmt(minor)}. Only ${fmt(a.remaining_amount)} is left to collect.`;
      }
      return closedMessage(refused);
    }, 'collection');
    if (result.ok) captureInputs.delete(id);
  }

  async function release(a, control) {
    state.rowNote = null;
    fill(status);
    control.busy(true);
    const result = await api('POST', `/authorizations/${encodeURIComponent(a.authorization_id)}/void`);
    await settle(a, result, `Released ${fmt(a.remaining_amount)} back to you.`, closedMessage, 'release');
  }

  function closedMessage(refused) {
    if (refused.code === 'authorization_expired') return "This reservation has expired, so it can't be collected. The list has been updated.";
    if (refused.code === 'authorization_not_open') return 'This reservation is no longer open. The list has been updated.';
    return `${sentence(refused.message)} The list has been updated.`;
  }

  /** Shows the outcome of a capture or void and refreshes the list; refusals stay on their row. */
  async function settle(a, result, successText, refusalText, what) {
    if (!ctx.view.alive) return;
    if (result.ok) {
      fill(status, feedback('success', null, successText));
    } else if (result.refused) {
      state.rowNote = { id: a.authorization_id, el: feedback('refused', 'authorization-error', refusalText(result)) };
    } else {
      state.rowNote = { id: a.authorization_id, el: feedback('uncertain', null, uncertainAbout(what)) };
    }
    await load();
  }

  load();
}
