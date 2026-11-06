import assert from 'node:assert/strict';
import test from 'node:test';
import { routeLoader } from './helpers/load-route.mjs';

function readinessFixture(roles, result) {
  let probes = 0;
  const load = routeLoader({
    '@/lib/dashboardSession': {
      async getDashboardRequestIdentity(request) {
        if (request.headers.get('authorization') !== 'Bearer fixture') {
          throw Object.assign(new Error('Authentication failed'), { status: 401 });
        }
        return { profile: { roles }, client: { async rpc(name) {
          assert.equal(name, 'marketing_readiness_probe');
          probes += 1;
          return result;
        } } };
      },
    },
  });
  return { load, route: load('app/api/marketing/readiness/route.ts'), get probes() { return probes; } };
}

function request(authorized = true) {
  return new Request('https://clm.test/api/marketing/readiness', {
    headers: { 'x-clm-active-role': 'Admin', ...(authorized ? { Authorization: 'Bearer fixture' } : {}) },
  });
}

test('Readiness diagnostics require an actual Admin role and do not probe for denied users', async () => {
  const fixture = readinessFixture(['PR Leader'], {});
  assert.equal((await fixture.route.GET(request(false))).status, 401);
  assert.equal((await fixture.route.GET(request())).status, 403);
  assert.equal(fixture.probes, 0);
});

test('Readiness distinguishes a missing migration from revoked database access and redacts errors', async () => {
  const fixture = readinessFixture(['Viewer', 'Admin'], { error: { code: 'PGRST202', message: 'Private DB connection detail' } });
  const response = await fixture.route.GET(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  const result = await response.json();
  assert.equal(result.schema, 'missing');
  assert.equal(fixture.probes, 1);
  assert.doesNotMatch(JSON.stringify(result), /Private DB connection detail/);

  const revoked = readinessFixture(['Admin'], { error: { code: '42501', message: 'Private privilege detail' } });
  const denied = await revoked.route.GET(request());
  assert.equal(denied.status, 403);
  assert.doesNotMatch(await denied.text(), /Private privilege detail/);
});

test('A schema marker and configured settings never mark unavailable drivers as connected or expose values', async () => {
  const { load } = readinessFixture(['Admin'], {});
  const { readMarketingReadiness } = load('lib/marketing/readiness.ts');
  const env = Object.fromEntries(['META_APP_ID', 'META_APP_SECRET', 'META_GRAPH_VERSION', 'MARKETING_CREDENTIALS_KEY', 'MARKETING_WORKER_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'].map((name) => [name, 'fixture-secret-value']));
  env.LIVE_META_PUBLISH_ENABLED = 'true';
  const result = await readMarketingReadiness({ rpc: async () => ({ data: '20261106000100' }) }, env);
  assert.equal(result.schema, 'current');
  assert.equal(result.liveMetaRequested, true);
  assert.equal(result.integrations.meta.status, 'adapter_unavailable');
  assert.equal(result.integrations.publisher.status, 'worker_unavailable');
  assert.deepEqual(result.integrations.meta.missingSettings, []);
  assert.doesNotMatch(JSON.stringify(result), /fixture-secret-value/);
});

test('Database operation budgets return a redacted 429 response', async () => {
  const { databaseError, marketingErrorResponse } = routeLoader({})('lib/marketing/server.ts');
  let failure;
  try { databaseError({ code: 'P0429', message: 'Private counter state' }); } catch (error) { failure = error; }
  const response = marketingErrorResponse(failure);
  assert.equal(response.status, 429);
  assert.equal((await response.json()).code, 'rate_limited');
});
