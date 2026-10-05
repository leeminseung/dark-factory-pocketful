// `/signup` and `/login`: the front door, a plum brand half and the form (design.md §7).
import { api } from '../lib/api.js';
import { fill, h } from '../lib/dom.js';
import { authRefusal } from '../lib/messages.js';
import { button, feedback, field } from '../lib/ui.js';

const KINDS = {
  signup: {
    title: 'Create your account', path: '/auth/signup', label: 'Create account', busyLabel: 'Creating…',
    other: ['Already have an account?', 'Log in', '/login'],
  },
  login: {
    title: 'Log in', path: '/auth/login', label: 'Log in', busyLabel: 'Logging in…',
    other: ['New to Pocketful?', 'Create an account', '/signup'],
  },
};

export const renderFrontDoor = (kind) => (ctx, main) => {
  const spec = KINDS[kind];
  const errorSlot = h('div', {});
  const clear = () => fill(errorSlot);
  const fields = kind === 'signup'
    ? {
      display_name: field({ label: 'Display name', testid: 'signup-display-name', hint: 'Shown to people you pay.', autocomplete: 'name', onInput: clear }),
      email: field({ label: 'Email', testid: 'signup-email', type: 'email', hint: 'Your handle comes from the part before the @.', autocomplete: 'email', onInput: clear }),
      password: field({ label: 'Password', testid: 'signup-password', type: 'password', hint: 'At least 8 characters.', autocomplete: 'new-password', onInput: clear }),
    }
    : {
      email: field({ label: 'Email', testid: 'login-email', type: 'email', autocomplete: 'email', onInput: clear }),
      password: field({ label: 'Password', testid: 'login-password', type: 'password', autocomplete: 'current-password', onInput: clear }),
    };
  const submit = button({ label: spec.label, busyLabel: spec.busyLabel, testid: `${kind}-submit`, type: 'submit', variant: 'primary wide' });

  async function send(event) {
    event.preventDefault();
    const body = Object.fromEntries(Object.entries(fields).map(([name, f]) => [name, f.input.value]));
    submit.busy(true);
    const result = await api('POST', spec.path, { body });
    submit.busy(false);
    if (!ctx.view.alive) return;
    if (result.ok) {
      await ctx.signedIn(result.body.token);
      return;
    }
    const text = result.refused
      ? authRefusal(result, { email: body.email, password: body.password })
      : "We couldn't reach Pocketful. Check your connection and try again.";
    fill(errorSlot, feedback('refused', 'auth-error', text));
  }

  fill(main,
    h('section', { class: 'brand-half' },
      h('p', { class: 'brand-wordmark' }, 'Pocketful'),
      h('p', { class: 'brand-headline' }, 'Pay, ask and split with people you know, by their handle.'),
      h('div', { class: 'bar brand-bar', 'aria-hidden': 'true' }, h('span', { class: 'bar-solid', style: 'width: 72%' }), h('span', { class: 'bar-held', style: 'width: 28%' }))),
    h('section', { class: 'door' },
      h('form', { class: 'door-form', onsubmit: send, novalidate: true },
        h('h1', { class: 'page-title' }, spec.title),
        Object.values(fields).map((f) => f.el),
        errorSlot,
        submit.el,
        h('p', { class: 'door-other' }, `${spec.other[0]} `, h('a', { href: spec.other[2], class: 'link' }, spec.other[1])))));
};
