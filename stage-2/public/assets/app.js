// Pocketful in the browser: one page that renders the route it was opened at.
//
// The server serves this page for every screen route; navigation inside the app uses the
// History API, so a screen's in-memory state (form values, the retry identity of a payment
// whose answer was lost) survives everything except a page reload.
import { api, session, whenSignedOut } from './lib/api.js';
import { fill, h } from './lib/dom.js';
import { renderFrontDoor } from './screens/front.js';
import { renderWallet } from './screens/wallet.js';
import { renderRequests } from './screens/requests.js';
import { renderSplit } from './screens/split.js';
import { renderAuthorizations } from './screens/authorizations.js';

const SCREENS = {
  '/': { render: renderWallet, nav: 'Wallet' },
  '/requests': { render: renderRequests, nav: 'Requests', column: true },
  '/split': { render: renderSplit, nav: 'Split' },
  '/authorizations': { render: renderAuthorizations, nav: 'Reserved', column: true },
  '/login': { render: renderFrontDoor('login'), front: true },
  '/signup': { render: renderFrontDoor('signup'), front: true },
};
const NAV = [['/', 'Wallet'], ['/requests', 'Requests'], ['/split', 'Split'], ['/authorizations', 'Reserved']];

const root = document.getElementById('app');
let me = null; // the signed-in user, as GET /me last answered
let view = null; // the live screen; `alive` turns false when it is replaced

const routeOf = (pathname) => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);

export function navigate(href, { replace = false } = {}) {
  const url = new URL(href, location.origin);
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  show();
}

/** Signs out locally and returns to the login screen. */
function signOut() {
  session.token = null;
  me = null;
  navigate('/login', { replace: true });
}
whenSignedOut(() => {
  me = null;
  if (!SCREENS[routeOf(location.pathname)]?.front) navigate('/login', { replace: true });
});

async function loadMe() {
  if (!session.token) return null;
  const res = await api('GET', '/me');
  if (res.ok) me = res.body;
  return res.ok ? me : null;
}

function header(route) {
  return h('header', { class: 'site-header' },
    h('div', { class: 'header-row container' },
      h('a', { href: '/', class: 'wordmark' }, 'Pocketful'),
      h('div', { class: 'who' },
        h('div', { class: 'who-text' },
          h('span', { testid: 'current-user', class: 'who-name', title: me.display_name }, me.display_name),
          h('span', { testid: 'current-handle', class: 'who-handle' }, me.handle)),
        h('button', { type: 'button', testid: 'logout-button', class: 'button text', onclick: signOut }, 'Log out'))),
    h('nav', { class: 'container', 'aria-label': 'Main' },
      h('ul', { class: 'nav' }, NAV.map(([href, label]) => h('li', {},
        h('a', { href, class: 'nav-link', 'aria-current': href === route ? 'page' : null }, label))))));
}

async function show() {
  if (view) view.alive = false;
  const route = routeOf(location.pathname);
  const screen = SCREENS[route] ?? SCREENS['/'];
  if (!screen.front && !session.token) {
    navigate('/login', { replace: true });
    return;
  }
  const current = { alive: true };
  view = current;
  if (session.token && !me) await loadMe();
  if (!current.alive) return;
  if (!screen.front && !me) {
    signOut();
    return;
  }
  const main = h('main', { class: screen.front ? 'front' : `container screen${screen.column ? ' column' : ''}`, id: 'main' });
  fill(root, me ? header(route) : null, main);
  const ctx = {
    me,
    view: current,
    money: { minorUnits: me?.minor_units ?? 2, currency: me?.currency ?? '' },
    navigate,
    /** After sign-in: remember the user and open the wallet. */
    async signedIn(token) {
      session.token = token;
      me = null;
      await loadMe();
      navigate('/');
    },
    /** Lets a screen keep the header's user current after it reads GET /me itself. */
    setMe(next) { me = next; },
  };
  screen.render(ctx, main);
  if (location.hash) document.getElementById(location.hash.slice(1))?.querySelector('input')?.focus();
}

// Same-origin links navigate inside the app; anything with a modifier key behaves normally.
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
  const url = new URL(link.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/assets/')) return;
  event.preventDefault();
  if (url.pathname === location.pathname && url.hash) {
    history.replaceState(null, '', url);
    document.getElementById(url.hash.slice(1))?.querySelector('input')?.focus();
    return;
  }
  navigate(url.href);
});
window.addEventListener('popstate', show);
show();
