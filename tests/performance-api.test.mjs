import assert from 'node:assert/strict';
import test from 'node:test';
import {routeLoader} from './helpers/load-route.mjs';
import * as performance from '../lib/performance.mjs';

test('performance API validates identity, reports source errors and keeps empty/zero data distinct',async t=>{
  let allowed=true;
  const load=routeLoader({
    '@/lib/performance.mjs':performance,
    '@/lib/dashboardSession':{getDashboardRequestIdentity:async()=>{if(!allowed)throw new (load('lib/serverAuth.ts').ApiAuthError)('Thiếu phiên đăng nhập.',401);}},
  });
  const route=load('app/api/performance/scores/route.ts');
  const request=new Request('http://localhost/api/performance/scores');
  const fetch=t.mock.method(globalThis,'fetch',async()=>new Response('Nhân sự,,,Hạng mục\nK141\n,Tuần 1\n,,A,,,0,10'));
  let response=await route.GET(request);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal((await response.json()).courses[0].weeks[0].people[0].diemLamViec,0);
  assert.equal(fetch.mock.calls[0].arguments[1].cache,'no-store');
  allowed=false;
  assert.equal((await route.GET(request)).status,401);
  assert.equal(fetch.mock.calls.length,1,'unauthorized request must not fetch the source');
  allowed=true;
  for(const source of [new Response('unavailable',{status:503}),new Response('<html>Sign in</html>'),new Response('Changed,Columns')]){
    fetch.mock.mockImplementation(async()=>source);
    response=await route.GET(request);
    assert.equal(response.status,502);
    assert.ok((await response.json()).error);
  }
  fetch.mock.mockImplementation(async()=>{throw new DOMException('Source timed out','TimeoutError');});
  assert.equal((await route.GET(request)).status,502);
  fetch.mock.mockImplementation(async()=>new Response('Nhân sự,,,Hạng mục'));
  assert.deepEqual((await (await route.GET(request)).json()).courses,[]);
});
