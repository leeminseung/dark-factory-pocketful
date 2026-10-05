// Stage 2 routes: screens for browsers, JSON for the API on the shared paths.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useServer, world } from './helpers.js';

const srv = useServer();
const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

test('S2-009 S2-140: /requests and /authorizations serve the UI for Accept: text/html, JSON otherwise', async () => {
  const w = await world(srv.base);
  for (const path of ['/requests', '/authorizations']) {
    const page = await fetch(srv.base + path, { headers: { accept: HTML } });
    assert.equal(page.status, 200, path);
    assert.match(page.headers.get('content-type'), /^text\/html; charset=utf-8/);
    assert.match(await page.text(), /<!doctype html>/i);
    const api = await fetch(srv.base + path, { headers: { authorization: `Bearer ${w.ada.token}` } });
    assert.match(api.headers.get('content-type'), /^application\/json/, path);
    const any = await fetch(srv.base + path, { headers: { authorization: `Bearer ${w.ada.token}`, accept: '*/*' } });
    assert.match(any.headers.get('content-type'), /^application\/json/, `${path} */*`);
  }
});

test('S2-001..S2-005: every screen route is directly navigable without a token', async () => {
  for (const path of ['/', '/requests', '/split', '/signup', '/login', '/authorizations']) {
    const page = await fetch(srv.base + path, { headers: { accept: HTML } });
    assert.equal(page.status, 200, path);
    assert.match(page.headers.get('content-type'), /^text\/html/);
  }
});

test('bundled assets are served with their types, and nothing outside them', async () => {
  const html = await (await fetch(`${srv.base}/`, { headers: { accept: HTML } })).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(assets.length > 0, 'the page loads its bundled assets');
  for (const asset of assets) assert.equal((await fetch(srv.base + asset)).status, 200, asset);
  for (const path of ['/assets/../package.json', '/assets/%2e%2e/package.json', '/assets/nope.js']) {
    const res = await fetch(srv.base + path);
    assert.equal(res.status, 404, path);
    assert.equal((await res.json()).error.code, 'not_found');
  }
});
