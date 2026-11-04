import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLoader } from './helpers/load-route.mjs';
const { readDraft, discardDraftIfUnchanged } = routeLoader({})('app/marketing/draft-cache.ts');

function cache() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('delayed save of A preserves newer B written after editor remount', async () => {
  const storage = cache();
  const a = JSON.stringify({ plan: 'A', version: 1 });
  const b = JSON.stringify({ plan: 'B', version: 1 });
  storage.setItem('plan-user-campaign', a);
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const snapshot = readDraft('plan-user-campaign', storage);
  const oldSave = pending.then(() => discardDraftIfUnchanged('plan-user-campaign', snapshot, storage));
  storage.setItem('plan-user-campaign', b);
  finish();
  assert.equal(await oldSave, false);
  assert.equal(storage.getItem('plan-user-campaign'), b);
});

test('cleanup removes the exact saved draft but keeps changed expected version', () => {
  const storage = cache();
  const a = JSON.stringify({ caption: 'same text', version: 1 });
  const nextVersion = JSON.stringify({ caption: 'same text', version: 2 });
  storage.setItem('content', a);
  assert.equal(discardDraftIfUnchanged('content', a, storage), true);
  assert.equal(storage.getItem('content'), null);
  storage.setItem('strategy', nextVersion);
  assert.equal(discardDraftIfUnchanged('strategy', a, storage), false);
  assert.equal(storage.getItem('strategy'), nextVersion);
});

test('unavailable storage and missing snapshots do not break save completion', () => {
  const denied = { getItem() { throw new Error('Storage denied'); }, removeItem() { throw new Error('Storage denied'); } };
  assert.equal(readDraft('x', denied), null);
  assert.equal(discardDraftIfUnchanged('x', 'saved', denied), false);
  assert.equal(discardDraftIfUnchanged('x', null, denied), false);
});
