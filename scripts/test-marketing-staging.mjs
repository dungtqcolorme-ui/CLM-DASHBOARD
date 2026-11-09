import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const workspaceLimit = 16 * 1024 * 1024;
const imageLimit = 8 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectRef = /^[a-z0-9]{20}$/;
const revisionSha = /^[a-f0-9]{40}$/;
const roles = [
  ['ADMIN', 'Admin'],
  ['LEADER', 'PR Leader'],
  ['REPRESENTATIVE', 'PR Representative'],
  ['VIEWER', 'Viewer'],
];

class AcceptanceError extends Error {
  constructor(check, message) {
    super(message);
    this.check = check;
  }
}

function requireCheck(condition, check, message) {
  if (!condition) throw new AcceptanceError(check, message);
}

function readActor(token, issuer, role, now) {
  let claims;
  try {
    if (typeof token === 'string' && token.length <= 16384 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
      claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    }
  } catch { /* Report a fixed message without disclosing the token. */ }
  requireCheck(
    claims?.iss === issuer && claims.role === 'authenticated' && claims.aud === 'authenticated' &&
      typeof claims.sub === 'string' && uuid.test(claims.sub) &&
      Number.isInteger(claims.exp) && claims.exp * 1000 > now + 300000,
    'configuration',
    'Cần access token Supabase của staging còn hạn ít nhất 5 phút cho vai trò ' + role + '.',
  );
  // Claims restrict where the credential may be sent. The app verifies the session and actual role.
  return { token, id: claims.sub.toLowerCase(), role };
}

function readConfiguration(env, now) {
  let origin;
  try {
    const url = new URL(env.CLM_STAGING_URL);
    if (url.protocol === 'https:' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash) {
      origin = url.origin;
    }
  } catch { /* Report a fixed message instead of echoing the URL. */ }
  const stagingRef = env.CLM_STAGING_SUPABASE_REF;
  const productionRef = env.CLM_PRODUCTION_SUPABASE_REF;
  const revision = env.CLM_STAGING_RELEASE_SHA;
  requireCheck(origin, 'configuration', 'CLM_STAGING_URL cần là origin HTTPS của staging.');
  requireCheck(projectRef.test(stagingRef ?? '') && projectRef.test(productionRef ?? '') && stagingRef !== productionRef,
    'configuration', 'Cần hai project ref Supabase hợp lệ và khác nhau cho staging và production.');
  requireCheck(revisionSha.test(revision ?? ''), 'configuration', 'Cần commit SHA đủ 40 ký tự của bản staging.');
  const team = env.CLM_STAGING_TEAM_ID?.toLowerCase();
  const otherTeam = env.CLM_STAGING_OTHER_TEAM_ID?.toLowerCase();
  const asset = env.CLM_STAGING_ASSET_ID?.toLowerCase();
  const otherAsset = env.CLM_STAGING_OTHER_ASSET_ID?.toLowerCase();
  requireCheck([team, otherTeam, asset, otherAsset].every((id) => uuid.test(id ?? '')) && team !== otherTeam && asset !== otherAsset,
    'configuration', 'Cần ID của hai team và hai ảnh fixture riêng tư khác nhau.');
  const protectionBypass = env.CLM_STAGING_VERCEL_BYPASS_SECRET;
  requireCheck(protectionBypass === undefined || /^[\x21-\x7e]{1,4096}$/.test(protectionBypass),
    'configuration', 'Biến xác thực Preview không đúng định dạng.');
  const publishableKey = env.CLM_STAGING_STORAGE_PUBLISHABLE_KEY;
  requireCheck(/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(publishableKey ?? ''),
    'configuration', 'Cần Supabase publishable key của staging để kiểm tra bucket trực tiếp.');
  const storageOrigin = 'https://' + stagingRef + '.supabase.co';
  const issuer = storageOrigin + '/auth/v1';
  const actors = roles.map(([key, role]) => readActor(env['CLM_STAGING_' + key + '_TOKEN'], issuer, role, now));
  requireCheck(new Set(actors.map((actor) => actor.id)).size === actors.length,
    'configuration', 'Cần tài khoản thử riêng cho từng vai trò.');
  return { origin, stagingRef, revision, team, otherTeam, asset, otherAsset, actors, protectionBypass, storageOrigin, publishableKey };
}

function latestMarketingMigration() {
  return readdirSync(new URL('../supabase/migrations/', import.meta.url))
    .map((name) => name.match(/^(\d{14})_marketing_[a-z0-9_]+\.sql$/)?.[1])
    .filter(Boolean).sort().at(-1);
}

async function boundedBytes(response, limit, check) {
  if (!response.body || Number(response.headers.get('content-length') ?? 0) > limit) {
    await response.body?.cancel();
    throw new AcceptanceError(check, 'Phản hồi trống hoặc vượt dung lượng nghiệm thu.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, length);
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new AcceptanceError(check, 'Phản hồi vượt dung lượng nghiệm thu.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
}

function verifyWorkspace(body, actor, team, otherTeam, check) {
  const profile = body?.profile;
  const roleMatches = Array.isArray(profile?.roles) && (actor.role === 'Admin'
    ? profile.roles.includes('Admin') : profile.roles.length === 1 && profile.roles[0] === actor.role);
  requireCheck(typeof profile?.id === 'string' && profile.id.toLowerCase() === actor.id && profile.status === 'active' &&
    roleMatches,
  check, 'Danh tính hoặc vai trò do ứng dụng xác minh không khớp tài khoản thử.');

  const keys = ['teams', 'memberships', 'campaigns', 'contentItems', 'revisions'];
  requireCheck(keys.every((key) => Array.isArray(body[key])), check, 'Dữ liệu workspace không đúng cấu trúc.');
  const expectedTeams = actor.role === 'Admin' ? [team, otherTeam] : [team];
  requireCheck(expectedTeams.every((id) => body.teams.some((row) => row.id === id) &&
    keys.slice(1).every((key) => body[key].some((row) => row.team_id === id))),
  check, 'Thiếu team, membership, Campaign, bài hoặc phiên bản thử để kiểm tra phạm vi.');
  if (actor.role === 'Admin') return;
  requireCheck(body.teams.every((row) => row.id === team) &&
    keys.slice(1).every((key) => body[key].every((row) => row.team_id === team)) &&
    body.memberships.some((row) => row.team_id === team && row.user_id === actor.id),
  check, 'Tài khoản thử thấy dữ liệu ngoài team được giao hoặc thiếu membership.');
}

export async function verifyMarketingStaging(env, { fetcher = fetch, now = Date.now() } = {}) {
  const config = readConfiguration(env, now);
  const [admin, , , viewer] = config.actors;
  const checks = [];

  async function request(path, check, expected, { actor, forgedRole, image = false, storage = false, keyOnly = false } = {}) {
    const headers = new Headers({ Accept: image ? 'image/png,image/jpeg' : 'application/json' });
    if (storage) headers.set('apikey', config.publishableKey);
    else if (config.protectionBypass) headers.set('X-Vercel-Protection-Bypass', config.protectionBypass);
    if (actor) headers.set('Authorization', 'Bearer ' + actor.token);
    else if (keyOnly) headers.set('Authorization', 'Bearer ' + config.publishableKey);
    if (forgedRole) headers.set('X-CLM-Active-Role', forgedRole);
    try {
      const response = await fetcher((storage ? config.storageOrigin : config.origin) + path, {
        method: 'GET', headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
      });
      const matches = expected === 'denied'
        ? [400, 403, 404].includes(response.status) || (keyOnly && response.status === 401)
        : response.status === expected;
      if (!matches) {
        await response.body?.cancel();
        throw new AcceptanceError(check, 'HTTP ' + response.status + ' không khớp kết quả mong đợi.');
      }
      const bytes = await boundedBytes(response, image ? imageLimit : storage ? 65536 : workspaceLimit, check);
      const cache = response.headers.get('cache-control') ?? '';
      requireCheck(storage || /\bno-store\b/i.test(cache), check, 'Phản hồi riêng tư thiếu no-store.');
      const type = response.headers.get('content-type') ?? '';
      if (image) {
        const png = type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216;
        requireCheck(png || jpeg, check, 'Dữ liệu ảnh riêng tư không đúng định dạng.');
        return png ? 'png' : 'jpg';
      }
      requireCheck(/^application\/json\b/i.test(type), check, 'Endpoint trả sai định dạng JSON.');
      const body = JSON.parse(bytes.toString('utf8'));
      if (expected === 'denied' && response.status === 400) {
        requireCheck([403, 404].includes(Number(body?.statusCode ?? body?.httpStatusCode)) ||
          ['NoSuchKey', 'NoSuchBucket', 'AccessDenied', 'not_found', 'unauthorized'].includes(body?.code),
        check, 'Storage trả lỗi 400 mà không xác nhận từ chối truy cập.');
      }
      return body;
    } catch (error) {
      if (error instanceof AcceptanceError) throw error;
      throw new AcceptanceError(check, 'Không đọc được phản hồi HTTPS. Kiểm tra URL, giới hạn thời gian và bảo vệ deployment.');
    }
  }

  const anonymous = await request('/api/marketing', 'anonymous', 401);
  requireCheck(anonymous?.code === 'unauthorized', 'anonymous', 'Không nhận được lỗi xác thực từ ứng dụng.');
  checks.push('anonymous');

  const readiness = await request('/api/marketing/readiness', 'deployment', 200, { actor: admin });
  const deployment = readiness?.deployment;
  requireCheck(['preview', 'staging'].includes(deployment?.environment) &&
    deployment.revision === config.revision && deployment.databaseProjectRef === config.stagingRef,
  'deployment', 'Deployment, commit hoặc dự án Supabase không khớp staging.');
  requireCheck(readiness.schema === 'current' && readiness.expectedMigration === latestMarketingMigration() &&
    readiness.liveMetaRequested === false,
  'deployment', 'Migration chưa khớp repo hoặc cờ Meta live đang bật.');
  checks.push('deployment');

  for (const actor of config.actors) {
    const check = 'workspace-' + actor.role;
    const data = await request('/api/marketing', check, 200, { actor });
    verifyWorkspace(data, actor, config.team, config.otherTeam, check);
    checks.push(check);
  }

  const forged = await request('/api/marketing/readiness', 'forged-admin', 403, { actor: viewer, forgedRole: 'Admin' });
  requireCheck(forged?.code === 'forbidden', 'forged-admin', 'Thiếu phản hồi từ chối vai trò giả mạo.');
  checks.push('forged-admin');

  const file = '/api/marketing/creative/file?id=';
  const extension = await request(file + config.asset, 'file-viewer', 200, { actor: viewer, image: true });
  checks.push('file-viewer');
  const otherExtension = await request(file + config.otherAsset, 'file-admin', 200, { actor: admin, image: true });
  checks.push('file-admin');
  const denied = await request(file + config.otherAsset, 'file-cross-team', 404, { actor: viewer });
  requireCheck(denied?.code === 'not_found', 'file-cross-team', 'Không xác nhận được ảnh ngoài phạm vi.');
  checks.push('file-cross-team');

  const storagePath = '/storage/v1/object/';
  const object = (team, asset, ext) => 'marketing-originals/' + team + '/' + asset + '/original.' + ext;
  const own = object(config.team, config.asset, extension);
  const outside = object(config.otherTeam, config.otherAsset, otherExtension);
  await request(storagePath + 'authenticated/' + own, 'storage-viewer', 200, { actor: viewer, image: true, storage: true });
  checks.push('storage-viewer');
  await request(storagePath + 'authenticated/' + outside, 'storage-admin', 200, { actor: admin, image: true, storage: true });
  checks.push('storage-admin');
  await request(storagePath + 'authenticated/' + outside, 'storage-cross-team', 'denied', { actor: viewer, storage: true });
  checks.push('storage-cross-team');
  await request(storagePath + 'public/' + outside, 'storage-public', 'denied', { storage: true });
  checks.push('storage-public');
  await request(storagePath + outside, 'storage-anonymous', 'denied', { storage: true, keyOnly: true });
  checks.push('storage-anonymous');
  return { status: 'passed', checks, migration: readiness.expectedMigration, revision: deployment.revision };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifyMarketingStaging(process.env);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const failure = error instanceof AcceptanceError
      ? { status: 'failed', check: error.check, error: error.message }
      : { status: 'failed', check: 'internal', error: 'Không thể hoàn tất nghiệm thu staging.' };
    console.error(JSON.stringify(failure, null, 2));
    process.exitCode = 1;
  }
}
