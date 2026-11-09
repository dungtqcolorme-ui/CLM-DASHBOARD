import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { verifyMarketingStaging } from './test-marketing-staging.mjs';

export async function testStagingAcceptance({ db, team, actors, tokens, storedBytes, clientFor, routes, report }) {
  const admin = actors[0];
  const origin = 'https://clm-staging.test';
  const stagingRef = 's'.repeat(20);
  const storageOrigin = 'https://' + stagingRef + '.supabase.co';
  const publishableKey = 'sb_publishable_fixture_1234567890';
  const revision = 'a'.repeat(40);
  const otherTeam = randomUUID();
  const otherCampaign = randomUUID();
  await db.query('insert into public.marketing_teams(id,name,creator_id) values($1,$2,$3)', [otherTeam, 'Staging QA team B', admin.id]);
  await db.query("insert into public.marketing_campaigns(id,team_id,name,kind,creator_id) values($1,$2,$3,'always_on',$4)",
    [otherCampaign, otherTeam, 'Staging QA campaign B', admin.id]);
  await db.query('insert into public.marketing_team_memberships(team_id,user_id) values($1,$2)', [otherTeam, admin.id]);
  const { rows: [otherContent] } = await db.query(
    "insert into public.marketing_content_items(campaign_id,team_id,creator_id,title,content_line,production_status) values($1,$2,$3,$4,'Sharing','writing') returning id",
    [otherCampaign, otherTeam, admin.id, 'Staging QA content B'],
  );
  await db.query(`insert into public.marketing_revisions(team_id,campaign_id,entity_type,entity_id,version,action,actor_id,snapshot)
    select team_id,campaign_id,'content',id,version,'create_content',creator_id,to_jsonb(item)
    from public.marketing_content_items item where id=$1`, [otherContent.id]);

  const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#136943' } }).png().toBuffer();
  const digest = createHash('sha256').update(png).digest('hex');
  async function seedImage(teamId) {
    const id = randomUUID();
    const path = teamId + '/' + id + '/original.png';
    await db.query(`insert into public.marketing_assets
      (id,team_id,title,filename,mime_type,byte_size,width,height,reported_sha256,storage_path,status,provenance,author,event,tags,rights,creator_id)
      values ($1,$2,'Staging QA image','qa.png','image/png',$3,24,24,$4,$5,'ready','Fixture','QA','',array[]::text[],'internal_only',$6)`,
      [id, teamId, png.length, digest, path, admin.id]);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('marketing-originals',$1,'{}'::jsonb)", [path]);
    storedBytes.set(path, png);
    return id;
  }

  const env = {
    CLM_STAGING_URL: origin,
    CLM_STAGING_VERCEL_BYPASS_SECRET: 'fixture-bypass-key',
    CLM_STAGING_STORAGE_PUBLISHABLE_KEY: publishableKey,
    CLM_STAGING_SUPABASE_REF: stagingRef,
    CLM_PRODUCTION_SUPABASE_REF: 'p'.repeat(20),
    CLM_STAGING_RELEASE_SHA: revision,
    CLM_STAGING_TEAM_ID: team.id,
    CLM_STAGING_OTHER_TEAM_ID: otherTeam,
    CLM_STAGING_ASSET_ID: await seedImage(team.id),
    CLM_STAGING_OTHER_ASSET_ID: await seedImage(otherTeam),
  };
  const actorKeys = { Admin: 'ADMIN', 'PR Leader': 'LEADER', 'PR Representative': 'REPRESENTATIVE', Viewer: 'VIEWER' };
  for (const actor of actors) {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = { sub: actor.id, iss: 'https://' + stagingRef + '.supabase.co/auth/v1', role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
    const token = encode({ alg: 'HS256' }) + '.' + encode(payload) + '.fixture';
    tokens.set(token, actor);
    env['CLM_STAGING_' + actorKeys[actor.roles[0]] + '_TOKEN'] = token;
  }
  const deployment = {
    VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_SHA: revision,
    NEXT_PUBLIC_SUPABASE_URL: 'https://' + stagingRef + '.supabase.co',
    LIVE_META_PUBLISH_ENABLED: 'false',
  };
  const previous = Object.fromEntries(Object.keys(deployment).map((name) => [name, process.env[name]]));
  const requested = [];
  const fetcher = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    requested.push(parsed.pathname);
    if (parsed.origin === storageOrigin) {
      assert.equal(options.headers.get('apikey'), publishableKey);
      assert.equal(options.headers.has('x-vercel-protection-bypass'), false);
      const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:(public|authenticated)\/)?marketing-originals\/(.+)$/);
      assert.ok(match);
      const [, access, path] = match;
      const authorization = options.headers.get('authorization');
      const missing = () => Response.json({ statusCode: '404' }, { status: 400 });
      if (access === 'public') {
        assert.equal(authorization, null);
        const { rows: [bucket] } = await db.query("select public from storage.buckets where id='marketing-originals'");
        return bucket.public ? new Response(png, { headers: { 'Content-Type': 'image/png' } }) : missing();
      }
      if (!access) {
        assert.equal(authorization, 'Bearer ' + publishableKey);
        const rows = await db.transaction(async (transaction) => {
          await transaction.exec('set local role anon');
          return (await transaction.query("select name from storage.objects where bucket_id='marketing-originals' and name=$1", [path])).rows;
        }).catch((error) => {
          if (error.code === '42501') return [];
          throw error;
        });
        return rows.length ? new Response(png, { headers: { 'Content-Type': 'image/png' } }) : missing();
      }
      const actor = tokens.get(authorization?.slice(7));
      assert.ok(actor);
      const { data } = await clientFor(actor).storage.from('marketing-originals').download(path);
      return data ? new Response(data, { headers: { 'Content-Type': 'image/png' } }) : missing();
    }
    assert.equal(parsed.origin, origin);
    assert.equal(options.headers.get('x-vercel-protection-bypass'), 'fixture-bypass-key');
    assert.equal(options.headers.has('apikey'), false);
    return routes[parsed.pathname].GET(new Request(url, options));
  };
  Object.assign(process.env, deployment);
  try {
    const result = await verifyMarketingStaging(env, { fetcher });
    assert.equal(result.checks.length, 15);
    assert.equal(result.status, 'passed');
    assert.equal(result.revision, revision);
    assert.doesNotMatch(JSON.stringify(result), /qa-\d|\.fixture|fixture-bypass-key|sb_publishable|Staging QA content B/);
    await db.exec("create policy staging_qa_storage_leak on storage.objects for select to authenticated using (bucket_id='marketing-originals')");
    try {
      await assert.rejects(verifyMarketingStaging(env, { fetcher }), (error) => error.check === 'storage-cross-team');
    } finally { await db.exec('drop policy staging_qa_storage_leak on storage.objects'); }
    await db.exec("update storage.buckets set public=true where id='marketing-originals'");
    try {
      await assert.rejects(verifyMarketingStaging(env, { fetcher }), (error) => error.check === 'storage-public');
    } finally { await db.exec("update storage.buckets set public=false where id='marketing-originals'"); }
    await db.exec("grant usage on schema storage to anon; grant select on storage.objects to anon; create policy staging_qa_anon_leak on storage.objects for select to anon using (bucket_id='marketing-originals')");
    try {
      await assert.rejects(verifyMarketingStaging(env, { fetcher }), (error) => error.check === 'storage-anonymous');
    } finally {
      await db.exec('drop policy staging_qa_anon_leak on storage.objects; revoke select on storage.objects from anon; revoke usage on schema storage from anon');
    }
    process.env.VERCEL_ENV = 'production';
    requested.length = 0;
    await assert.rejects(verifyMarketingStaging(env, { fetcher }), (error) => error.check === 'deployment');
    assert.deepEqual(requested, ['/api/marketing', '/api/marketing/readiness']);
    await assert.rejects(verifyMarketingStaging({ ...env, CLM_STAGING_SUPABASE_REF: env.CLM_PRODUCTION_SUPABASE_REF }, { fetcher }),
      (error) => error.check === 'configuration');
    assert.equal(requested.length, 2);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  report.checks.push('Staging acceptance runner checks a pinned deployment and four scoped roles against real RLS, detects a public bucket and overbroad authenticated or anonymous Storage SELECT, and rejects production before scoped reads');
}
