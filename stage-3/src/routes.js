// Every endpoint, with what the server must establish before its handler runs.
//   auth:       a valid bearer token is required (§6)
//   operator:   the caller must be a settlement operator (§11)
//   idempotent: an Idempotency-Key is required and the handler runs through §7 replay rules
//   noBody:     the endpoint defines no request body: none or an empty one is fine, but a body
//               that is sent must still parse as a JSON object (§5, ruling R3)
import { login, signup } from './handlers/auth.js';
import { createCorrection, listRevisions } from './handlers/corrections.js';
import { me, statement } from './handlers/history.js';
import {
  captureAuthorization, createAuthorization, listAuthorizations, voidAuthorization,
} from './handlers/authorizations.js';
import { activity, createPayment } from './handlers/payments.js';
import {
  cancelRequest, createRequest, declineRequest, listRequests, payRequest,
} from './handlers/requests.js';
import { createSettlement } from './handlers/settlements.js';
import { createSplit } from './handlers/splits.js';
import { exportSnapshot, health, importSnapshot, reset } from './handlers/testControl.js';

/**
 * Prepares route definitions for matching. An idempotent handler must be synchronous
 * (idempotency.js): an async one is refused here, at startup, before it could ever
 * apply a change that the key record then misses.
 */
export function defineRoutes(definitions) {
  for (const route of definitions) {
    if (route.idempotent && route.handler.constructor.name === 'AsyncFunction') {
      throw new Error(`${route.method} ${route.path}: an idempotent handler must be synchronous`);
    }
  }
  return definitions.map((route) => ({ ...route, segments: route.path.split('/').slice(1) }));
}

export const routes = defineRoutes([
  { method: 'GET', path: '/health', handler: health },
  { method: 'POST', path: '/_test/reset', handler: reset },
  { method: 'GET', path: '/_test/export', handler: exportSnapshot },
  { method: 'POST', path: '/_test/import', handler: importSnapshot },
  { method: 'POST', path: '/auth/signup', handler: signup },
  { method: 'POST', path: '/auth/login', handler: login },
  { method: 'GET', path: '/me', handler: me, auth: true },
  { method: 'GET', path: '/statement', handler: statement, auth: true },
  { method: 'POST', path: '/payments', handler: createPayment, auth: true, idempotent: true },
  { method: 'GET', path: '/activity', handler: activity, auth: true },
  {
    method: 'POST', path: '/payments/:id/corrections', handler: createCorrection,
    auth: true, idempotent: true,
  },
  { method: 'GET', path: '/payments/:id/revisions', handler: listRevisions, auth: true },
  { method: 'POST', path: '/requests', handler: createRequest, auth: true, idempotent: true },
  { method: 'GET', path: '/requests', handler: listRequests, auth: true },
  { method: 'POST', path: '/requests/:id/pay', handler: payRequest, auth: true, idempotent: true },
  { method: 'POST', path: '/requests/:id/decline', handler: declineRequest, auth: true, noBody: true },
  { method: 'POST', path: '/requests/:id/cancel', handler: cancelRequest, auth: true, noBody: true },
  { method: 'POST', path: '/splits', handler: createSplit, auth: true, idempotent: true },
  { method: 'POST', path: '/authorizations', handler: createAuthorization, auth: true, idempotent: true },
  { method: 'GET', path: '/authorizations', handler: listAuthorizations, auth: true },
  {
    method: 'POST', path: '/authorizations/:id/capture', handler: captureAuthorization,
    auth: true, idempotent: true,
  },
  {
    method: 'POST', path: '/authorizations/:id/void', handler: voidAuthorization,
    auth: true, noBody: true,
  },
  {
    method: 'POST', path: '/settlements', handler: createSettlement,
    auth: true, operator: true, idempotent: true,
  },
]);

/** The route for `method` and `pathname`, with its path parameters, or null. */
export function matchRoute(method, pathname) {
  const segments = pathname.replace(/\/+$/, '').split('/').slice(1);
  for (const route of routes) {
    if (route.method !== method || route.segments.length !== segments.length) continue;
    const params = {};
    const matches = route.segments.every((part, i) => {
      if (part.startsWith(':')) {
        params[part.slice(1)] = segments[i];
        return segments[i] !== '';
      }
      return part === segments[i];
    });
    if (matches) return { route, params };
  }
  return null;
}
