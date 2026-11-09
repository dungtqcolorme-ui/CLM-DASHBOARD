import { createHmac } from 'node:crypto';
import https from 'node:https';

const pageSize = 10;
const cursorPattern = /^[A-Za-z0-9._~+\/=-]{1,2048}$/;
const invalidResponse = 'Meta trả về phản hồi không hợp lệ.';
const maxGraphBytes = 2 * 1024 * 1024;

/** @typedef {{ id: string, excerpt: string, created_at: string }} PublishedPost */

export class MetaPageError extends Error {
  constructor(message, status = 502, code = 'meta_read_failed') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** @param {Record<string, string | undefined>} env */
function pageSettings(env) {
  const pageId = env.META_PAGE_ID?.trim() ?? '';
  const graphVersion = env.META_GRAPH_VERSION?.trim() ?? '';
  const token = env.META_PAGE_ACCESS_TOKEN?.trim() ?? '';
  const appSecret = env.META_APP_SECRET?.trim();

  if (!/^[1-9]\d{0,31}$/.test(pageId)) throw new MetaPageError('META_PAGE_ID phải là ID dạng số của Page.', 503, 'meta_not_configured');
  if (!/^v[1-9]\d*\.\d+$/.test(graphVersion)) throw new MetaPageError('META_GRAPH_VERSION phải là phiên bản Graph API của ứng dụng Meta.', 503, 'meta_not_configured');
  if (!/^[A-Za-z0-9._~+/-]+=*$/.test(token)) throw new MetaPageError('Cần nạp META_PAGE_ACCESS_TOKEN qua kênh bảo mật.', 503, 'meta_not_configured');
  const appProof = appSecret ? createHmac('sha256', appSecret).update(token).digest('hex') : null;
  return { pageId, graphVersion, token, appSecret, appProof };
}

/** @param {URL} url @param {Record<string, string>} headers @param {AbortSignal} signal */
function requestGraph(url, headers, signal) {
  // Use the native transport so a URL with appsecret_proof stays out of framework fetch traces.
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, signal }, (response) => {
      const status = response.statusCode ?? 502;
      resolve({ status, ok: status >= 200 && status < 300, async json() {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response) {
          bytes += chunk.length;
          if (bytes > maxGraphBytes) throw new MetaPageError(invalidResponse);
          chunks.push(chunk);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } });
    });
    request.on('error', reject);
  });
}

/** @param {ReturnType<typeof pageSettings>} settings @param {string} path @param {URLSearchParams} params @param {typeof fetch | undefined} fetcher */
async function graphGet(settings, path, params, fetcher) {
  const url = new URL(`https://graph.facebook.com/${settings.graphVersion}/${path}`);
  url.search = params.toString();
  if (settings.appProof) url.searchParams.set('appsecret_proof', settings.appProof);
  let response;
  try {
    const headers = { Authorization: `Bearer ${settings.token}` };
    const signal = AbortSignal.timeout(10_000);
    response = fetcher
      ? await fetcher(url, { method: 'GET', headers, redirect: 'error', cache: 'no-store', signal })
      : await requestGraph(url, headers, signal);
  } catch {
    throw new MetaPageError('Không thể gọi Meta Graph API.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const code = body?.error?.code;
    const codeLabel = Number.isSafeInteger(code) && code > 0 ? `, mã ${code}` : '';
    const action = path === 'me' ? 'xác thực Page' : 'đọc bài đã đăng';
    const message = `Meta từ chối ${action} (HTTP ${response.status}${codeLabel}).`;
    throw new MetaPageError(message, response.status === 429 ? 429 : 502);
  }
  return body;
}

/** @param {string} value @param {ReturnType<typeof pageSettings>} settings */
function containsCredential(value, { token, appSecret, appProof }) {
  const decoded = value.replace(/%[a-f0-9]{2}/gi, (part) => String.fromCharCode(Number.parseInt(part.slice(1), 16)));
  return [token, appSecret, appProof].some((secret) => secret && (value.includes(secret) || decoded.includes(secret)));
}

/** @param {ReturnType<typeof pageSettings>} settings @param {typeof fetch | undefined} fetcher */
async function verifyIdentity(settings, fetcher) {
  const body = await graphGet(settings, 'me', new URLSearchParams({ fields: 'id,name' }), fetcher);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (typeof body?.id !== 'string' || !name || containsCredential(name, settings)) throw new MetaPageError(invalidResponse);
  if (body.id !== settings.pageId) throw new MetaPageError('Token đại diện cho Page ID khác META_PAGE_ID hoặc không phải token của Page.');
  return { status: 'verified', page_id: settings.pageId, page_name: name };
}

/** @param {Record<string, string | undefined>} env @param {typeof fetch} [fetcher] */
export async function verifyMetaPage(env = process.env, fetcher) {
  return verifyIdentity(pageSettings(env), fetcher);
}

/** @param {Record<string, string | undefined>} env @param {string} [cursor] @param {typeof fetch} [fetcher] */
export async function readMetaPagePosts(env = process.env, cursor, fetcher) {
  const settings = pageSettings(env);
  if (cursor !== undefined && (!cursorPattern.test(cursor) || containsCredential(cursor, settings))) {
    throw new MetaPageError('Cursor Meta không hợp lệ.', 400, 'invalid_meta_cursor');
  }
  const page = await verifyIdentity(settings, fetcher);
  const params = new URLSearchParams({ fields: 'id,message,created_time', limit: String(pageSize) });
  if (cursor) params.set('after', cursor);
  const body = await graphGet(settings, `${page.page_id}/published_posts`, params, fetcher);
  if (!Array.isArray(body?.data) || body.data.length > pageSize) throw new MetaPageError(invalidResponse);

  /** @type {PublishedPost[]} */
  const posts = body.data.map((post) => {
    const id = post?.id;
    const createdTime = typeof post?.created_time === 'string' ? Date.parse(post.created_time) : NaN;
    if (typeof id !== 'string' || !/^[0-9]{1,32}(?:_[0-9]{1,32})?$/.test(id) ||
        (id.includes('_') && !id.startsWith(`${page.page_id}_`)) || !Number.isFinite(createdTime)) {
      throw new MetaPageError(invalidResponse);
    }
    const message = typeof post.message === 'string' ? post.message.trim() : '';
    const excerpt = containsCredential(message, settings) ? '' : Array.from(message).slice(0, 240).join('');
    return { id, excerpt, created_at: new Date(createdTime).toISOString() };
  });
  const after = body.paging?.cursors?.after;
  const next = body.paging?.next && typeof after === 'string' && after !== cursor &&
    cursorPattern.test(after) && !containsCredential(after, settings) ? after : null;
  return { page, posts, next };
}
