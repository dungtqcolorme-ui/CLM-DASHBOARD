import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function verifyMetaPage(env = process.env, fetcher = fetch) {
  const pageId = env.META_PAGE_ID?.trim() ?? '';
  const graphVersion = env.META_GRAPH_VERSION?.trim() ?? '';
  const token = env.META_PAGE_ACCESS_TOKEN?.trim() ?? '';
  const appSecret = env.META_APP_SECRET?.trim();

  if (!/^[1-9]\d{0,31}$/.test(pageId)) throw new Error('META_PAGE_ID phải là ID dạng số của Page.');
  if (!/^v[1-9]\d*\.\d+$/.test(graphVersion)) throw new Error('META_GRAPH_VERSION phải là phiên bản Graph API của ứng dụng Meta.');
  if (!/^[A-Za-z0-9._~+/-]+=*$/.test(token)) throw new Error('Cần nạp META_PAGE_ACCESS_TOKEN qua kênh bảo mật.');

  const url = new URL(`https://graph.facebook.com/${graphVersion}/me`);
  url.searchParams.set('fields', 'id,name');
  if (appSecret) {
    url.searchParams.set('appsecret_proof', createHmac('sha256', appSecret).update(token).digest('hex'));
  }

  let response;
  try {
    response = await fetcher(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Không thể gọi Meta Graph API.');
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const code = body?.error?.code;
    const codeLabel = Number.isSafeInteger(code) && code > 0 ? `, mã ${code}` : '';
    throw new Error(`Meta từ chối xác thực Page (HTTP ${response.status}${codeLabel}).`);
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (typeof body?.id !== 'string' || !name || name.includes(token) || (appSecret && name.includes(appSecret))) {
    throw new Error('Meta trả về phản hồi không hợp lệ.');
  }
  if (body.id !== pageId) throw new Error('Token đại diện cho Page ID khác META_PAGE_ID hoặc không phải token của Page.');
  return { status: 'verified', page_id: pageId, page_name: name };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await verifyMetaPage()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
