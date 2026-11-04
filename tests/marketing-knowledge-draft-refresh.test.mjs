import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLoader } from './helpers/load-route.mjs';
const { canAdoptServerDraft } = routeLoader({})('app/marketing/knowledge/draft-refresh.ts');

test('clean DNA editor adopts the newly applied version, once per server revision', () => {
  assert.equal(canAdoptServerDraft(1, 0, false, null), true);
  assert.equal(canAdoptServerDraft(1, 1, false, null), false);
  assert.equal(canAdoptServerDraft(2, 1, false, null), true);
});

test('dirty or cached DNA draft retains its original optimistic base on refresh', () => {
  assert.equal(canAdoptServerDraft(1, 0, true, null), false);
  assert.equal(canAdoptServerDraft(1, 0, false, '{"base_version":0}'), false);
  assert.equal(canAdoptServerDraft(2, 0, true, '{"base_version":0}'), false);
});

test('explicit adoption or successful save can resume clean version synchronization', () => {
  assert.equal(canAdoptServerDraft(2, 0, false, null), true);
  assert.equal(canAdoptServerDraft(2, 2, false, null), false);
  assert.equal(canAdoptServerDraft(undefined, undefined, false, null), false);
});
