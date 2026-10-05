// Unauthenticated control endpoints: health (§3.2), reset (§3.3), export and import (§10).
import { buildState, parseFixture } from '../fixture.js';
import { exportState, importState } from '../snapshot.js';
import { store } from '../state.js';

export const health = () => ({ status: 200, body: { status: 'ok' } });

/** Replaces all state with the fixture; a rejected fixture leaves the live state untouched. */
export async function reset({ body }) {
  const next = await buildState(parseFixture(body));
  store.current = next;
  return { status: 204 };
}

export const exportSnapshot = ({ state }) => ({ status: 200, body: exportState(state) });

export function importSnapshot({ body }) {
  store.current = importState(body);
  return { status: 204 };
}
