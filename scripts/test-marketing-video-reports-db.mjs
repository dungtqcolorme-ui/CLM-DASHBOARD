/** Disposable PostgreSQL regression runner. No network/database URL is accepted.
 * Use MARKETING_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js
 * for an external test-only installation; this adds no application dependency.
 */
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const moduleName = process.env.MARKETING_PGLITE_MODULE;
const { PGlite } = await import(moduleName ? pathToFileURL(path.resolve(moduleName)).href : '@electric-sql/pglite');
const db = new PGlite();
const notifications = process.argv.includes('--notifications');
const thumbnails = notifications || process.argv.includes('--calendar-thumbnails');
const taskLinks = thumbnails || process.argv.includes('--task-links');
const kpiRevisions = taskLinks || process.argv.includes('--kpi-revisions');
const hardening = kpiRevisions || process.argv.includes('--hardening');
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.profiles(id uuid primary key references auth.users(id), email text unique not null,
      full_name text not null default '', status text not null default 'pending' check(status in('active','pending','locked')));
    create table public.user_roles(user_id uuid references public.profiles(id), role text not null
      check(role in('Admin','PR Leader','PR Representative','Viewer')), primary key(user_id, role));
  `);
  await db.exec(`create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
  if (taskLinks) await db.exec(`
    create table public.tasks(id text primary key,title text not null,owner_id uuid references public.profiles(id),created_by uuid references public.profiles(id),deadline date,status text,deleted_at timestamptz,version bigint not null default 1);
    alter table public.tasks enable row level security;
    grant select on public.tasks to authenticated;
    create function public.current_user_active() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and status='active')$$;
    create policy task_fixture_read on public.tasks for select to authenticated using (deleted_at is null and public.current_user_active());
  `);
  if (!process.argv.includes('--without-migration')) {
    const files = (await readdir(path.join(root, 'supabase/migrations'))).filter(file => /_marketing_(foundation|knowledge|creative|publishing|video_reports)\.sql$/.test(file)).sort();

    for (const file of files) await db.exec(await readFile(path.join(root, 'supabase/migrations', file), 'utf8'));
    if (hardening) await db.exec(await readFile(path.join(root, 'supabase/migrations/20261106000100_marketing_hardening.sql'), 'utf8'));
    if (kpiRevisions) await db.exec(await readFile(path.join(root, 'supabase/migrations/20261106000200_marketing_kpi_revisions.sql'), 'utf8'));
    if (taskLinks) await db.exec(await readFile(path.join(root,'supabase/migrations/20261108000100_marketing_task_links.sql'),'utf8'));
    if (thumbnails) await db.exec(await readFile(path.join(root,'supabase/migrations/20261108000200_marketing_calendar_thumbnails.sql'),'utf8'));
    if (notifications) await db.exec(await readFile(path.join(root,'supabase/migrations/20261109000100_marketing_notifications.sql'),'utf8'));
  }
  for (const file of ['marketing_foundation.test.sql','marketing_knowledge.test.sql','marketing_creative.test.sql','marketing_publishing.test.sql']) {
    await db.exec(await readFile(path.join(root,'supabase/tests',file),'utf8'));
    console.log(`${file}: passed with Phase 5 migration installed.`);
  }
  if (hardening) {
    await db.exec(await readFile(path.join(root, 'supabase/tests/marketing_hardening.test.sql'), 'utf8'));
    console.log('Marketing hardening SQL passed.');
  }
  if (kpiRevisions) {
    await db.exec(await readFile(path.join(root,'supabase/tests/marketing_kpi_revisions.test.sql'),'utf8'));
    console.log('Marketing KPI revision SQL passed.');
  }
  if (taskLinks) {
    await db.exec(await readFile(path.join(root,'supabase/tests/marketing_task_links.test.sql'),'utf8'));
    console.log('Marketing Task link SQL passed.');
  }
  if (thumbnails) {
    await db.exec(await readFile(path.join(root,'supabase/tests/marketing_calendar_thumbnails.test.sql'),'utf8'));
    console.log('Marketing Calendar thumbnail budgets SQL passed.');
  }
  if (notifications) {
    await db.exec(await readFile(path.join(root,'supabase/tests/marketing_notifications.test.sql'),'utf8'));
    console.log('Marketing recipient notification SQL passed.');
  }
  // Keep the rollback-only SQL fixture alive for actual parser -> RPC -> stored JSON checks.
  await db.exec((await readFile(path.join(root, 'supabase/tests/marketing_video_reports.test.sql'), 'utf8')).replace(/rollback;\s*$/, ''));
  const { transpileModule, ModuleKind } = await import('typescript');
  const compile = source => transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext}}).outputText;
  const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const modules = {};
  for (const name of ['domain','creative-domain','input','video-domain','report-domain']) {
    let source = compile(await readFile(path.join(root,`lib/marketing/${name}.ts`),'utf8'));
    for(const [dependency,url] of Object.entries(modules)) source=source.replaceAll(JSON.stringify(`@/lib/marketing/${dependency}`),JSON.stringify(url));
    modules[name]=data(source);
  }
  const {parseVideoCommand,parseVideoTimeline}=await import(modules['video-domain']);
  const {parseReportCommand}=await import(modules['report-domain']);
  await db.exec("set local role authenticated; select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true)");
  const setting = async name => JSON.parse((await db.query('select current_setting($1) as value',[name])).rows[0].value);
  let roundtrips=0;
  const command=async (kind,value)=>{
    const parsed=(kind==='video'?parseVideoCommand:parseReportCommand)(value);
    const result=(await db.query(`select public.marketing_${kind}_command($1::jsonb) as result`,[JSON.stringify(parsed)])).rows[0].result;
    if(!result?.id)throw new Error('RPC did not return persisted identity');
    if(result.timeline)parseVideoTimeline(result.timeline);
    roundtrips++;return result;
  };
  const source=await command('video',await setting('vt.reserve'));
  await db.exec('reset role');
  // Fixture storage service writes authoritative object metadata; user completion still executes user RPC.
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('marketing-footage',$1,$2::jsonb)",[source.storage_path,JSON.stringify({mimetype:source.mime_type,size:source.byte_size})]);
  await db.exec('set local role authenticated');
  await command('video',{action:'complete_video_source',id:source.id,expected_version:source.version});
  await command('video',{action:'review_video_source',id:source.id,expected_version:2,rights:'approved',reason:'Fixture rights',allowed_channels:['facebook'],valid_until:null});
  let project=await command('video',await setting('vt.create'));
  project=await command('video',{action:'save_video_project',id:project.id,expected_version:project.version,title:'Parser roundtrip',timeline:project.timeline});
  await command('video',{action:'create_video_variant',id:project.id,expected_version:project.version,title:'Parser variant'});
  const history=(await db.query('select id from public.marketing_video_versions where project_id=$1 and version=1',[project.id])).rows[0];
  project=await command('video',{action:'restore_video_project',id:project.id,expected_version:project.version,version_id:history.id});
  const job=await command('video',{action:'request_video_render',id:project.id,expected_version:project.version});
  if(job.status!=='not_configured'||job.progress!==null||job.output_asset_id!==null)throw new Error('Unconfigured render must have no output/progress');
  await command('video',{action:'cancel_video_render',id:job.id,expected_version:job.version,reason:'Fixture cancel'});
  let report=await command('report',await setting('vt.build'));
  if(!Array.isArray(report.metrics.organic.observations)||typeof report.metrics.coverage.production_tracking_started_at!=='string'||report.metrics.production.reviewed!==null&&typeof report.metrics.production.reviewed!=='number')throw new Error('Coverage and frozen observation evidence must survive the RPC JSON boundary');
  for(const key of ['reach','views','reactions','comments','shares','clicks','engagement_rate','numerator','denominator'])if(report.metrics.organic[key]!==null&&typeof report.metrics.organic[key]!=='number')throw new Error(`Metric ${key} must retain number|null JSON`);
  report=await command('report',{action:'edit_report',id:report.id,expected_version:report.version,title:'Báo cáo',narrative:'Nội bộ – kiểm chứng dữ liệu.'});
  await command('report',{action:'approve_report_share',id:report.id,expected_version:report.version,reason:'Reviewed',confirmed:true});
  const insight=(await db.query('select id,version from public.marketing_insights where report_id=$1',[report.id])).rows[0];
  if(!insight)throw new Error('Expected actual production gap insight');
  await command('report',{action:'feedback_insight',id:insight.id,expected_version:insight.version,status:'accepted',reason:'Manual follow-up only'});
  await db.exec('rollback');
  console.log(`${roundtrips} actual API-parser/PostgreSQL RPC roundtrips passed.`);
  console.log('Video and reports PostgreSQL regression passed.');
} catch(error) { console.error({message:error.message,code:error.code,where:error.where,position:error.position});process.exitCode=1; } finally { await db.close(); }
