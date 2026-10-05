// `/split`: split an amount you paid; the preview shows each share before anything is sent,
// computed by the same function the server uses (assets/shared/shares.js, stage-1 §9).
import { api } from '../lib/api.js';
import { fill, h } from '../lib/dom.js';
import { amountHint, formatAmount, parseAmount } from '../lib/money.js';
import { splitRefusal, uncertainAbout } from '../lib/messages.js';
import { equalShares } from '../shared/shares.js';
import { RetryIdentity, button, feedback, field } from '../lib/ui.js';

/** The handles in the order typed: comma-separated, trimmed, blanks dropped. */
const handlesOf = (text) => text.split(',').map((x) => x.trim()).filter(Boolean);

export function renderSplit(ctx, main) {
  const { money } = ctx;
  const fmt = (minor) => formatAmount(minor, money);
  const identity = new RetryIdentity();
  const edited = () => {
    identity.edited();
    renderPreview();
  };
  const amount = field({ label: 'Total amount', testid: 'split-amount', inputmode: 'decimal', suffix: money.currency, autocomplete: 'off', onInput: edited });
  const handles = field({
    label: 'Split between', testid: 'split-handles', autocomplete: 'off', onInput: edited,
    hint: "Handles separated by commas, in order. Include yourself if you're sharing the bill.",
  });
  const note = field({ label: 'Note (optional)', testid: 'split-note', autocomplete: 'off', onInput: () => identity.edited() });
  const submit = button({ label: 'Send split requests', busyLabel: 'Sending…', testid: 'split-submit', type: 'submit' });
  const out = h('div', { class: 'form-feedback' });
  const preview = h('section', { class: 'plum-panel split-preview', testid: 'split-preview', 'aria-live': 'polite', 'aria-label': 'Each person pays' });

  function renderPreview() {
    const minor = parseAmount(amount.input.value, money);
    const people = handlesOf(handles.input.value);
    if (amount.input.value.trim() !== '' && minor === null) {
      fill(preview, h('h2', {}, 'Each person pays'), h('p', { class: 'on-plum-soft' }, amountHint(money)));
      return;
    }
    if (minor === null || people.length === 0) {
      fill(preview, h('h2', {}, 'Each person pays'), h('p', { class: 'on-plum-soft' }, 'Enter an amount and at least one handle to see each share.'));
      return;
    }
    const shares = equalShares(minor, people.length);
    fill(preview,
      h('h2', {}, 'Each person pays'),
      h('ol', { class: 'share-rows' }, people.map((handle, i) => {
        const self = handle === ctx.me.handle;
        return h('li', { class: 'share-row' },
          h('span', { class: 'share-handle' }, h('span', { class: 'share-handle-text' }, handle), self && ' (you)'),
          self && h('span', { class: 'on-plum-soft share-paid' }, 'Already paid'),
          h('span', { class: 'share-amount', testid: `split-share-${handle}` }, fmt(shares[i])));
      })),
      h('p', { class: 'on-plum-soft' }, `Shares add up to ${fmt(minor)}.`));
  }

  async function send(event) {
    event.preventDefault();
    const minor = parseAmount(amount.input.value, money);
    if (minor === null) {
      fill(out, feedback('refused', 'split-error', amountHint(money)));
      return;
    }
    const people = handlesOf(handles.input.value);
    const body = { amount: minor, participant_handles: people, note: note.input.value };
    submit.busy(true);
    const result = await api('POST', '/splits', { body, key: identity.current(JSON.stringify(body)) });
    submit.busy(false);
    if (!ctx.view.alive) return;
    if (!result.unknown) identity.settle();
    if (result.ok) {
      const asked = result.body.requests.length;
      fill(out, feedback('success', null, `Asked ${asked} ${asked === 1 ? 'person' : 'people'} for their share of ${fmt(minor)}. `),
        h('a', { href: '/requests', class: 'link' }, 'See requests'));
    } else if (result.refused) {
      fill(out, feedback('refused', 'split-error', splitRefusal(result, { handles: people })));
    } else {
      fill(out, feedback('uncertain', null, uncertainAbout('split')));
    }
  }

  renderPreview();
  fill(main,
    h('h1', { class: 'page-title' }, 'Split a bill'),
    h('div', { class: 'split-grid' },
      h('form', { class: 'split-form', onsubmit: send, novalidate: true },
        h('div', { class: 'split-top' }, amount.el, handles.el),
        h('div', { class: 'split-preview-slot' }, preview),
        h('div', { class: 'split-bottom' }, note.el, submit.el, out))));
}
