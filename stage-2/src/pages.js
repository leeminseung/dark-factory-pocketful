// The browser side (stage 2): the screen routes and the bundled assets, all held in memory.
//
// Every screen is the same single page (public/index.html), which renders the route itself.
// `/requests` and `/authorizations` are shared with the API: they are screens only for a
// request that accepts text/html (stage 2 "Return the UI for Accept: text/html").
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const SCREENS = new Set(['/', '/split', '/signup', '/login']);
const SHARED_WITH_API = new Set(['/requests', '/authorizations']);

const SHARED = fileURLToPath(new URL('./shared/', import.meta.url));

const page = readFileSync(join(PUBLIC, 'index.html'));

/** Every file under `dir`, served at `prefix` + its relative path. */
function filesUnder(dir, prefix) {
  return readdirSync(dir, { recursive: true })
    .filter((name) => statSync(join(dir, name)).isFile())
    .map((name) => [`${prefix}${name.split('\\').join('/')}`, {
      body: readFileSync(join(dir, name)), type: TYPES[extname(name)] ?? 'application/octet-stream',
    }]);
}

// Only files that exist at startup can be served, so no path can reach outside the folders.
// src/shared holds code the server and the browser both run (the split rule).
const assets = new Map([...filesUnder(join(PUBLIC, 'assets'), '/assets/'), ...filesUnder(SHARED, '/assets/shared/')]);

const acceptsHtml = (accept) => typeof accept === 'string' && accept.toLowerCase().includes('text/html');

/** The static response for a GET, or null when the request is for the API. */
export function staticResponse(pathname, accept) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (SCREENS.has(path) || (SHARED_WITH_API.has(path) && acceptsHtml(accept))) {
    return { body: page, type: TYPES['.html'] };
  }
  return assets.get(pathname) ?? null;
}
