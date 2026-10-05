// Every browser module loads: imports resolve and named exports exist (app.js is left out, as it
// renders at load and needs a document).
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

test('every screen and library module loads', async () => {
  const dir = new URL('../public/assets/', import.meta.url);
  const files = ['lib', 'screens', 'shared'].flatMap((sub) =>
    readdirSync(new URL(`${sub}/`, dir)).filter((f) => f.endsWith('.js')).map((f) => new URL(`${sub}/${f}`, dir)));
  assert.equal(files.length, 14, "7 lib, 5 screens, 2 shared");
  for (const file of files) await import(file.href);
});
