import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLoader } from './helpers/load-route.mjs';
const { reconcileCampaignNavigation } = routeLoader({})('app/marketing/campaign-context.ts');

test('refresh cannot revert picker B while navigation from URL A is pending', () => {
  const first = reconcileCampaignNavigation('', 'user', '/marketing/studio', 'new=1&campaign=A', ['A', 'B']);
  assert.equal(first.selection, 'A');
  // Picker chooses B immediately; a GET completes before router.replace commits.
  const refresh = reconcileCampaignNavigation(first.key, 'user', '/marketing/studio', 'new=1&campaign=A', ['A', 'B']);
  assert.equal(refresh.selection, undefined);
  const committed = reconcileCampaignNavigation(refresh.key, 'user', '/marketing/studio', 'new=1&campaign=B', ['A', 'B']);
  assert.equal(committed.selection, 'B');
  const created = reconcileCampaignNavigation(committed.key, 'user', '/marketing/studio', 'content=created&campaign=B', ['A', 'B']);
  assert.equal(created.selection, 'B');
});

test('dynamic Campaign links override query only within verified scope', () => {
  assert.equal(reconcileCampaignNavigation('', 'user', '/marketing/campaigns/B', 'campaign=A', ['A', 'B']).selection, 'B');
  assert.equal(reconcileCampaignNavigation('', 'user', '/marketing/campaigns/other-team', 'campaign=A', ['A']).selection, undefined);
  assert.equal(reconcileCampaignNavigation('', 'user', '/marketing/studio', 'campaign=other-team', ['A']).selection, undefined);
});

test('new identity and back navigation each reconcile their own URL context', () => {
  const first = reconcileCampaignNavigation('', 'user1', '/marketing/studio', 'campaign=A', ['A', 'B']);
  const second = reconcileCampaignNavigation(first.key, 'user1', '/marketing/calendar', 'campaign=B', ['A', 'B']);
  assert.equal(second.selection, 'B');
  assert.equal(reconcileCampaignNavigation(second.key, 'user1', '/marketing/studio', 'campaign=A', ['A', 'B']).selection, 'A');
  assert.equal(reconcileCampaignNavigation(first.key, 'user2', '/marketing/studio', 'campaign=A', ['B']).selection, undefined);
});
