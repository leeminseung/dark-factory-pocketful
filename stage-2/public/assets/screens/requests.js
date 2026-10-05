// `/requests`: what others asked of you and what you asked, with pay, decline and cancel.
import { api, readAll } from '../lib/api.js';
import { fill, h } from '../lib/dom.js';
import { formatAmount } from '../lib/money.js';
import { sentence, uncertainAbout } from '../lib/messages.js';
import { timeEl } from '../lib/time.js';
import { LatestRead, RetryIdentity, handleText, button, chip, emptyState, feedback, loadingRows, plate } from '../lib/ui.js';

export function renderRequests(ctx, main) {
  const { money } = ctx;
  const fmt = (minor) => formatAmount(minor, money);
  const state = { requests: null, me: ctx.me, rowNote: null };
  const reads = new LatestRead();
  // One retry identity per request, so a repeated Pay click on the same request is a replay.
  const payIdentities = new Map();

  const strip = h('section', { class: 'plum-strip', 'aria-label': 'Waiting for you' });
  const status = h('div', { class: 'screen-feedback' });
  const body = h('div', { class: 'sections' }, loadingRows('Loading requests…'));
  fill(main, h('h1', { class: 'page-title' }, 'Requests'), strip, status, body);

  async function load() {
    const seq = reads.begin();
    const [list, meRes] = await Promise.all([readAll('/requests', 'requests'), api('GET', '/me')]);
    if (!ctx.view.alive) return;
    if (!list.ok) {
      if (reads.isLatest(seq)) fill(body, feedback('refused', null, "Couldn't load your requests. Try again in a moment."));
      return;
    }
    if (!reads.accept(seq)) return;
    state.requests = list.items;
    if (meRes.ok) state.me = meRes.body;
    render();
  }

  function render() {
    const mine = ctx.me.user_id;
    const incoming = state.requests.filter((r) => r.payer_id === mine);
    const outgoing = state.requests.filter((r) => r.requester_id === mine);
    const waiting = incoming.filter((r) => r.status === 'pending');
    const waitingSum = waiting.reduce((sum, r) => sum + r.amount, 0);
    fill(strip, waiting.length === 0
      ? h('p', { class: 'strip-line' }, 'Nothing is waiting for you.')
      : [h('p', { class: 'strip-label' }, 'Waiting for you'),
        h('p', { class: 'strip-figure' }, `${waiting.length} ${waiting.length === 1 ? 'request' : 'requests'}, ${fmt(waitingSum)}`)]);
    const bothEmpty = incoming.length === 0 && outgoing.length === 0;
    fill(body,
      bothEmpty && emptyState({
        testid: 'empty-requests', title: 'No requests yet.',
        body: 'Ask someone for money from your wallet, and it shows up here.', action: 'Ask for money', href: '/#request',
      }),
      section('Asked of you', 'incoming-list', incoming, 'Nobody has asked you for money.', bothEmpty),
      section('You asked', 'outgoing-list', outgoing, "You haven't asked anyone for money.", bothEmpty));
  }

  function section(title, testid, rows, emptyText, bothEmpty) {
    const list = h('ol', { class: 'rows', testid }, rows.map((r) => row(r, testid === 'incoming-list')));
    if (bothEmpty) return h('div', { class: 'quiet-lists' }, list);
    return h('section', { class: 'list-section' },
      h('h2', {}, title),
      rows.length === 0 && h('p', { class: 'meta empty-line' }, emptyText),
      list);
  }

  function row(r, incoming) {
    const other = incoming ? r.requester_handle : r.payer_handle;
    const pending = r.status === 'pending';
    const note = state.rowNote?.id === r.request_id ? state.rowNote.el : null;
    return h('li', { class: 'row', testid: `request-item-${r.request_id}`, data: { status: r.status } },
      plate(other, incoming ? 'received' : 'sent'),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-head' },
          h('p', { class: 'row-title' }, incoming ? [handleText(other), ' asks you for'] : ['You asked ', handleText(other), ' for']),
          h('p', { class: 'row-amount', testid: `request-amount-${r.request_id}` }, fmt(r.amount))),
        r.note && h('p', { class: 'row-note' }, r.note),
        h('p', { class: 'meta row-meta' }, chip(r.status), h('span', {}, 'Asked ', timeEl(r.created_at))),
        pending && h('div', { class: 'row-actions' }, incoming
          ? [actionButton(r, 'pay'), actionButton(r, 'decline')]
          : [actionButton(r, 'cancel')]),
        note));
  }

  const ACTIONS = {
    pay: { label: (r) => `Pay ${fmt(r.amount)}`, busy: 'Paying…', variant: 'primary', done: (r) => `Paid ${fmt(r.amount)} to ${r.requester_handle}.` },
    decline: { label: () => 'Decline', busy: 'Declining…', variant: 'outline', done: (r) => `Declined ${r.requester_handle}'s request.` },
    cancel: { label: () => 'Cancel request', busy: 'Cancelling…', variant: 'text', done: (r) => `Cancelled your request to ${r.payer_handle}.` },
  };

  function actionButton(r, action) {
    const spec = ACTIONS[action];
    const control = button({
      label: spec.label(r), busyLabel: spec.busy, testid: `request-${action}-${r.request_id}`, variant: spec.variant,
      onClick: () => act(r, action, control),
    });
    return control.el;
  }

  async function act(r, action, control) {
    state.rowNote = null;
    fill(status);
    control.busy(true);
    let options = {};
    if (action === 'pay') {
      if (!payIdentities.has(r.request_id)) payIdentities.set(r.request_id, new RetryIdentity());
      options = { body: {}, key: payIdentities.get(r.request_id).current('{}') };
    }
    const result = await api('POST', `/requests/${encodeURIComponent(r.request_id)}/${action}`, options);
    if (!ctx.view.alive) return;
    if (result.ok) {
      fill(status, feedback('success', null, ACTIONS[action].done(r)));
      await load();
    } else if (result.refused) {
      // Refresh first, so the message can say what the request has become and stale buttons go.
      await load();
      const now = state.requests?.find((x) => x.request_id === r.request_id);
      state.rowNote = { id: r.request_id, el: feedback('refused', 'request-error', refusal(result, r, action, now)) };
      if (state.requests) render();
    } else {
      state.rowNote = { id: r.request_id, el: feedback('uncertain', null, uncertainAbout(action === 'pay' ? 'payment' : 'change')) };
      if (state.requests) render();
    }
  }

  function refusal(result, r, action, now) {
    if (result.code === 'request_not_pending') {
      if (action === 'pay' && now?.status === 'cancelled') return "This request was cancelled, so it can't be paid. The list has been updated.";
      const verb = { pay: 'paid', decline: 'declined', cancel: 'cancelled' }[action];
      return `This request is no longer waiting, so it can't be ${verb}. The list has been updated.`;
    }
    if (result.code === 'insufficient_funds') {
      return `Not paid. You have ${fmt(state.me.available)} available to spend and this request is ${fmt(r.amount)}.`;
    }
    return `${sentence(result.message)} The list has been updated.`;
  }

  load();
}
