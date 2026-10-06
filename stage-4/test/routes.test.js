import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defineRoutes, routes } from '../src/routes.js';

test('R8: an async handler on an idempotent path is refused when routes are defined, before any request', () => {
  const handler = async () => ({});
  assert.throws(() => defineRoutes([{ method: 'POST', path: '/x', handler, auth: true, idempotent: true }]),
    /must be synchronous/);
  assert.doesNotThrow(() => defineRoutes([{ method: 'POST', path: '/x', handler, auth: true }]));
});

test('every idempotent route of the service is synchronous and authenticated', () => {
  for (const route of routes.filter((r) => r.idempotent)) {
    assert.notEqual(route.handler.constructor.name, 'AsyncFunction', route.path);
    assert.equal(route.auth, true, route.path);
  }
});
