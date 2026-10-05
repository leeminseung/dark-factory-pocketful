// `/`: the balance panel, the three money forms (send, ask, reserve) and the activity feed.
import { api, readAll } from '../lib/api.js';
import { fill, h } from '../lib/dom.js';
import { hatchSwatch, icon } from '../lib/icons.js';
import { amountHint, formatAmount, parseAmount } from '../lib/money.js';
import { moneyRefusal, uncertainAbout } from '../lib/messages.js';
import { clockNow, timeEl } from '../lib/time.js';
import { LatestRead, RetryIdentity, button, emptyState, feedback, field, loadingRows, plate, privacy } from '../lib/ui.js';

// The three money forms differ only in these facts.
const FORMS = {
  pay: {
    anchor: 'pay', title: 'Send money', path: '/payments', handleKey: 'to_handle', visibility: true,
    label: 'Send payment', busyLabel: 'Sending…', variant: 'primary', band: true,
    verb: 'Not sent', kind: 'payment', uncertainTestid: 'pay-uncertain', retryLabel: 'Retry payment',
    success: (amount, handle) => `Sent ${amount} to ${handle}.`,
  },
  request: {
    anchor: 'request', title: 'Ask for money', path: '/requests', handleKey: 'payer_handle', visibility: false,
    label: 'Send request', busyLabel: 'Asking…', variant: 'outline',
    verb: 'Not sent', kind: 'request', retryLabel: 'Retry request',
    success: (amount, handle) => `Asked ${handle} for ${amount}.`,
  },
  authorize: {
    anchor: 'reserve', title: 'Reserve money', path: '/authorizations', handleKey: 'to_handle', visibility: true,
    label: 'Reserve money', busyLabel: 'Reserving…', variant: 'outline',
    verb: 'Not reserved', kind: 'reservation', retryLabel: 'Retry reservation',
    success: (amount, handle) => `Reserved ${amount} for ${handle}. It stays yours until they collect it.`,
  },
};

export function renderWallet(ctx, main) {
  const { money } = ctx;
  const fmt = (minor) => formatAmount(minor, money);
  const state = { me: ctx.me, payments: null };
  const reads = new LatestRead();

  // ---- balance panel -------------------------------------------------------
  const panel = h('section', { class: 'plum-panel balance', 'aria-label': 'Balance' });
  const bar = { el: h('div', { class: 'bar', 'aria-hidden': 'true' }) };
  bar.solid = h('span', { class: 'bar-solid' });
  bar.held = h('span', { class: 'bar-held' });
  bar.el.append(bar.solid, bar.held);
  // Refresh stays clickable while a read is in flight: a newer click must be able to overtake it.
  const refreshButton = button({ label: 'Refresh', busyLabel: 'Refreshing…', testid: 'wallet-refresh', variant: 'on-plum', onClick: () => refresh() });
  refreshButton.el.prepend(icon('refresh', 'refresh-icon'));
  const refreshing = (on) => {
    refreshButton.busy(on);
    refreshButton.el.disabled = false;
  };
  const updated = h('span', { class: 'meta on-plum-meta', role: 'status' });
  const figures = h('div', { class: 'figures' }, h('p', { class: 'available-label', role: 'status' }, 'Loading your balance…'));
  fill(panel, figures, bar.el, h('div', { class: 'refresh-row' }, refreshButton.el, updated));

  function renderBalance() {
    const { me } = state;
    const held = me.held;
    fill(figures,
      h('div', { class: 'available' },
        h('p', { class: 'available-label' }, 'Available to spend'),
        h('p', { class: 'available-figure', testid: 'wallet-available', data: { amount: String(me.available) } }, fmt(me.available))),
      h('dl', { class: 'secondary-figures' },
        h('div', { class: 'figure-line' },
          h('dt', {}, 'Total'),
          h('dd', { testid: 'wallet-balance', data: { amount: String(me.total) } }, fmt(me.total))),
        held > 0 && h('div', { class: 'figure-line held-line' },
          h('dt', {}, h('a', { href: '/authorizations', class: 'held-link' }, hatchSwatch(), 'Held for others')),
          h('dd', { testid: 'wallet-held', data: { amount: String(held) } }, fmt(held)))));
    // Decorative only: the held share of the total slides into hatch (design.md §8).
    const heldShare = me.total > 0 ? (held / me.total) * 100 : 0;
    bar.solid.style.width = `${100 - heldShare}%`;
    bar.held.style.width = `${heldShare}%`;
  }

  // ---- forms ---------------------------------------------------------------
  const forms = Object.fromEntries(Object.entries(FORMS).map(([name, spec]) => [name, moneyForm(name, spec)]));

  function moneyForm(name, spec) {
    const identity = new RetryIdentity();
    const out = h('div', { class: 'form-feedback' });
    let uncertain = false;
    // While an answer is missing, the button says "Retry" exactly when the form is the one sent.
    const edited = () => {
      identity.edited();
      if (uncertain) submit.setLabel(identity.matches(JSON.stringify(bodyNow())) ? spec.retryLabel : spec.label);
    };
    const handle = field({ label: 'Handle', testid: `${name}-handle`, hint: 'Their Pocketful handle, like ada', autocomplete: 'off', onInput: edited });
    const amount = field({ label: 'Amount', testid: `${name}-amount`, inputmode: 'decimal', suffix: money.currency, autocomplete: 'off', onInput: edited });
    const note = field({ label: 'Note (optional)', testid: `${name}-note`, autocomplete: 'off', onInput: edited });
    const visibility = spec.visibility && field({
      label: 'Who sees it', testid: `${name}-visibility`, onInput: edited,
      options: [['public', 'Everyone (public)'], ['private', 'Only the two of you (private)']],
    });
    const submit = button({ label: spec.label, busyLabel: spec.busyLabel, testid: `${name}-submit`, variant: spec.variant, type: 'submit' });
    const errorTestid = `${name}-error`;

    /** The body the form would send now; amount null when it is not a valid amount. */
    function bodyNow() {
      const body = { [spec.handleKey]: handle.input.value.trim(), amount: parseAmount(amount.input.value, money), note: note.input.value };
      if (visibility) body.visibility = visibility.input.value;
      return body;
    }

    async function send(event) {
      event.preventDefault();
      const body = bodyNow();
      const minor = body.amount;
      if (minor === null) {
        fill(out, feedback('refused', errorTestid, amountHint(money)));
        return;
      }
      submit.busy(true);
      const result = await api('POST', spec.path, { body, key: identity.current(JSON.stringify(body)) });
      submit.busy(false);
      if (!ctx.view.alive) return;
      uncertain = false;
      submit.setLabel(spec.label);
      if (!result.unknown) identity.settle();
      if (result.ok) {
        fill(out, feedback('success', null, spec.success(fmt(minor), body[spec.handleKey])));
        await refresh();
      } else if (result.refused) {
        await refresh();
        fill(out, feedback('refused', errorTestid, moneyRefusal(result, {
          money, available: state.me.available, amount: minor, handle: body[spec.handleKey],
          note: body.note, verb: spec.verb, kind: spec.kind,
        })));
      } else {
        uncertain = true;
        submit.setLabel(spec.retryLabel);
        fill(out, feedback('uncertain', spec.uncertainTestid ?? null, uncertainAbout(spec.kind)));
      }
    }

    return h('section', { class: `money-form form-${name}${spec.band ? ' band' : ''}`, id: spec.anchor },
      h('h2', {}, spec.title),
      h('form', { onsubmit: send, novalidate: true },
        h('div', { class: 'fields' }, handle.el, amount.el, note.el, visibility && visibility.el),
        submit.el, out));
  }

  // ---- activity ------------------------------------------------------------
  const feed = h('section', { class: 'activity', 'aria-labelledby': 'activity-title' });
  const feedBody = h('div', {}, loadingRows('Loading activity…'));
  feed.append(h('h2', { id: 'activity-title' }, 'Activity'), feedBody);

  function renderFeed() {
    const mine = state.me.handle;
    if (state.payments.length === 0) {
      fill(feedBody, emptyState({
        testid: 'empty-activity', title: 'No payments yet.',
        body: 'Send money to someone by their handle, and it shows up here.',
        action: 'Send money', href: '/#pay',
      }));
      return;
    }
    fill(feedBody, h('ol', { class: 'rows', testid: 'activity-list' }, state.payments.map((p) => {
      const direction = p.to_handle === mine ? 'received' : p.from_handle === mine ? 'sent' : 'between';
      const other = direction === 'received' ? p.from_handle : p.to_handle;
      const who = (handleText) => h('span', { class: handleText === mine ? 'self' : null }, handleText);
      return h('li', { class: 'row', testid: `activity-item-${p.payment_id}`, data: { visibility: p.visibility } },
        plate(other, direction),
        h('div', { class: 'row-main' },
          h('div', { class: 'row-head' },
            h('p', { class: 'row-title', testid: `activity-parties-${p.payment_id}` }, who(p.from_handle), ' paid ', who(p.to_handle)),
            h('p', { class: 'row-amount', testid: `activity-amount-${p.payment_id}` }, fmt(p.amount))),
          h('p', { class: 'meta row-meta' },
            h('span', {}, { received: 'Received', sent: 'Sent', between: 'Between others' }[direction]),
            timeEl(p.created_at), privacy(p.visibility)),
          h('p', { class: 'row-note', testid: `activity-note-${p.payment_id}` }, p.note)));
    })));
  }

  // ---- reading: the latest read wins (LatestRead) ---------------------------
  async function refresh() {
    const seq = reads.begin();
    refreshing(true);
    const [meRes, feedRes] = await Promise.all([api('GET', '/me'), readAll('/activity', 'payments')]);
    if (!ctx.view.alive) return;
    if (reads.isLatest(seq)) refreshing(false);
    if (!meRes.ok || !feedRes.ok) {
      if (reads.isLatest(seq)) updated.textContent = "Couldn't refresh. Try again.";
      return;
    }
    if (!reads.accept(seq)) return;
    state.me = meRes.body;
    ctx.setMe(meRes.body);
    state.payments = feedRes.items;
    renderBalance();
    renderFeed();
    updated.textContent = `Updated ${clockNow()}`;
  }

  // Grid areas place these: at 375 px balance, send, activity, ask, reserve; on desktop
  // the balance across the top, activity on the left, the three forms on the right.
  main.classList.add('wallet-grid');
  fill(main, panel, forms.pay, feed, forms.request, forms.authorize);
  refresh();
}
