import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLoader } from './helpers/load-route.mjs';

const { latestOrganicForComparison, matchedOrganicPeers } = routeLoader({})('lib/marketing/organic-comparison.ts');
const row = {
  team_id: 'team', connection_id: 'connection', page_id: 'page', campaign_id: 'campaign',
  content_line: 'Sharing', format: 'image', window: '7d', eligibility: 'organic',
  reach: 0, definitions: { reach: 'organic reach in 7d' },
  fetched_at: '2026-11-08T12:00:00Z', created_at: '2026-11-08T12:01:00Z',
};
const observed = (id, fields = {}) => ({ ...row, id, post_id: id, ...fields });

test('Organic comparison applies latest eligibility before campaign filtering and matches measurement definitions', () => {
  const anchor = observed('anchor');
  const peer = observed('peer', { reach: 12 });
  const rows = [
    anchor, peer, observed('boosted', { fetched_at: '2026-11-09T05:00:00.123111Z', created_at: '2026-11-09T06:00:01Z' }),
    observed('boosted-new', { post_id: 'boosted', eligibility: 'paid', fetched_at: '2026-11-09T12:00:00.123456+07:00', created_at: '2026-11-09T06:00:00Z' }),
    observed('reassigned'),
    observed('reassigned-new', { post_id: 'reassigned', campaign_id: 'other', fetched_at: '2026-11-09T12:00:00Z' }),
    observed('missing', { reach: null }),
    observed('definition', { definitions: { reach: 'combined reach' } }),
    observed('another-page', { page_id: 'different' }),
    observed('another-window', { window: '24h' }),
    observed('another-format', { format: 'video' }),
    observed('another-team', { team_id: 'different' }),
    observed('another-line', { content_line: 'Meme' }),
  ];
  const current = latestOrganicForComparison(rows, 'campaign');
  assert.ok(!current.some((item) => ['boosted', 'reassigned'].includes(item.post_id)));
  assert.deepEqual(matchedOrganicPeers(anchor, current, 'reach'), [peer]);
  assert.deepEqual(matchedOrganicPeers({ ...anchor, reach: null }, current, 'reach'), []);
});
