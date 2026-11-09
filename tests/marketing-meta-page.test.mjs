import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import { verifyMetaPage } from '../scripts/verify-marketing-meta-page.mjs';
import * as metaPage from '../lib/marketing/meta-page.mjs';
import { routeLoader } from './helpers/load-route.mjs';

const pageId = '103245086061688';
const pageName = 'Color ME Partnership';
const token = 'test-only-page-token';
const env = { META_PAGE_ID: pageId, META_GRAPH_VERSION: 'v24.0', META_PAGE_ACCESS_TOKEN: token };

test('reads the token identity from Meta and returns only the matched Page metadata', async () => {
  const result = await verifyMetaPage(env, async (url, options) => {
    assert.equal(String(url), 'https://graph.facebook.com/v24.0/me?fields=id%2Cname');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ id: pageId, name: pageName, access_token: token });
  });
  assert.deepEqual(result, { status: 'verified', page_id: pageId, page_name: pageName });
});

test('rejects a different identity or missing Page name', async () => {
  await assert.rejects(verifyMetaPage(env, async () => Response.json({ id: '123', name: pageName })), /Page ID khác/);
  await assert.rejects(verifyMetaPage(env, async () => Response.json({ id: pageId })), /phản hồi không hợp lệ/);
});

test('fails before requesting Meta with missing credentials or an invalid Graph version', async () => {
  const unexpectedFetch = () => assert.fail('Invalid configuration must not issue an HTTP request');
  await assert.rejects(verifyMetaPage({ ...env, META_PAGE_ACCESS_TOKEN: '' }, unexpectedFetch), /META_PAGE_ACCESS_TOKEN/);
  await assert.rejects(verifyMetaPage({ ...env, META_GRAPH_VERSION: 'v24.0/../other' }, unexpectedFetch), /META_GRAPH_VERSION/);
});

test('reports Graph and network errors without forwarding raw diagnostic text', async () => {
  await assert.rejects(verifyMetaPage(env, async () => Response.json({ error: { code: 190, message: token } }, { status: 400 })), {
    message: 'Meta từ chối xác thực Page (HTTP 400, mã 190).',
  });
  await assert.rejects(verifyMetaPage(env, async () => { throw new Error(token); }), { message: 'Không thể gọi Meta Graph API.' });
});

test('adds appsecret_proof when the app requires it without sending the app secret', async () => {
  const appSecret = 'test-only-app-secret';
  await verifyMetaPage({ ...env, META_APP_SECRET: appSecret }, async (url) => {
    assert.equal(url.searchParams.get('appsecret_proof'), createHmac('sha256', appSecret).update(token).digest('hex'));
    assert.ok(!String(url).includes(appSecret));
    return Response.json({ id: pageId, name: pageName });
  });
});

test('reads only published posts on the verified Page and ignores Graph pagination URLs', async () => {
  const cursor = 'cursor+for/next=';
  const calls = [];
  const result = await metaPage.readMetaPagePosts(env, cursor, async (url, options) => {
    calls.push(url.pathname);
    assert.equal(url.origin, 'https://graph.facebook.com');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.cache, 'no-store');
    if (url.pathname.endsWith('/me')) return Response.json({ id: pageId, name: pageName });
    assert.equal(url.searchParams.get('limit'), '10');
    assert.equal(url.searchParams.get('after'), cursor);
    return Response.json({
      data: [{ id: `${pageId}_100`, message: 'Bài Partnership', created_time: '2026-11-08T10:30:00+0000', access_token: token }],
      paging: { next: `https://wrong.test/?access_token=${token}`, cursors: { after: 'next-page' } },
    });
  });
  assert.deepEqual(calls, ['/v24.0/me', `/v24.0/${pageId}/published_posts`]);
  assert.deepEqual(result, {
    page: { status: 'verified', page_id: pageId, page_name: pageName },
    posts: [{ id: `${pageId}_100`, excerpt: 'Bài Partnership', created_at: '2026-11-08T10:30:00.000Z' }],
    next: 'next-page',
  });
});

test('rejects cross-Page tokens before posts and does not expose invalid pagination metadata', async () => {
  let calls = 0;
  await assert.rejects(metaPage.readMetaPagePosts(env, undefined, async () => {
    calls += 1;
    return Response.json({ id: '123', name: 'Other Page' });
  }), /Page ID khác/);
  assert.equal(calls, 1);
  const result = await metaPage.readMetaPagePosts(env, undefined, async (url) => Response.json(url.pathname.endsWith('/me')
    ? { id: pageId, name: pageName }
    : { data: [{ id: `${pageId}_100`, message: `Post mentions ${token}`, created_time: '2026-11-08T10:30:00+0000' }], paging: { next: 'anything', cursors: { after: token } } }));
  assert.equal(result.next, null);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(token));
});

test('redacts a credential written as a URL-encoded string in returned text', async () => {
  const specialToken = 'test/token+value=';
  const encoded = 'test%2ftoken+value%3D';
  const settings = { ...env, META_PAGE_ACCESS_TOKEN: specialToken };
  await assert.rejects(verifyMetaPage(settings, async () => Response.json({ id: pageId, name: encoded })), /phản hồi không hợp lệ/);
  const result = await metaPage.readMetaPagePosts(settings, undefined, async (url) => Response.json(url.pathname.endsWith('/me')
    ? { id: pageId, name: pageName }
    : { data: [{ id: `${pageId}_100`, message: encoded, created_time: '2026-11-08T10:30:00+0000' }] }));
  assert.equal(result.posts[0].excerpt, '');
});

test('keeps the proof out of framework fetch and refuses a native HTTP redirect', async (t) => {
  const appSecret = 'test-only-app-secret';
  t.mock.method(globalThis, 'fetch', () => assert.fail('Graph URL must stay out of fetch telemetry'));
  let redirect = false;
  const get = t.mock.method(https, 'get', (url, options, callback) => {
    assert.equal(url.origin, 'https://graph.facebook.com');
    assert.equal(url.searchParams.get('appsecret_proof'), createHmac('sha256', appSecret).update(token).digest('hex'));
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    const bytes = redirect ? [] : [Buffer.from(JSON.stringify({ id: pageId, name: pageName }))];
    const incoming = Object.assign(Readable.from(bytes), { statusCode: redirect ? 302 : 200, headers: { location: 'https://elsewhere.test/' } });
    queueMicrotask(() => callback(incoming));
    return new EventEmitter();
  });
  const settings = { ...env, META_APP_SECRET: appSecret };
  assert.equal((await verifyMetaPage(settings)).page_id, pageId);
  redirect = true;
  get.mock.resetCalls();
  await assert.rejects(verifyMetaPage(settings), /HTTP 302/);
  assert.equal(get.mock.callCount(), 1);
});

test('published posts route uses actual Admin roles and returns a no-store response', async () => {
  let roles = ['Viewer'];
  let calls = 0;
  const route = routeLoader({
    '@/lib/dashboardSession': { async getDashboardRequestIdentity(request) {
      if (!request.headers.has('Authorization')) throw Object.assign(new Error('Login required'), { status: 401 });
      return { profile: { roles } };
    } },
    '@/lib/marketing/meta-page.mjs': { ...metaPage, async readMetaPagePosts(_env, cursor) {
      calls += 1;
      assert.equal(cursor, 'page-2');
      return { page: { page_id: pageId }, posts: [], next: null };
    } },
  })('app/api/marketing/meta/published-posts/route.ts');
  const url = 'https://clm.test/api/marketing/meta/published-posts?after=page-2';
  assert.equal((await route.GET(new Request(url))).status, 401);
  const request = new Request(url, { headers: { Authorization: 'Bearer fixture', 'x-clm-active-role': 'Admin' } });
  assert.equal((await route.GET(request)).status, 403);
  assert.equal(calls, 0);
  roles = ['Viewer', 'Admin'];
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.equal((await response.json()).page.page_id, pageId);
});
