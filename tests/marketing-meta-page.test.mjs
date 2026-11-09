import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyMetaPage } from '../scripts/verify-marketing-meta-page.mjs';

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
