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
  if (!process.argv.includes('--without-migration')) {
    const files = (await readdir(path.join(root, 'supabase/migrations'))).filter(file => /_marketing_(foundation|knowledge|creative)\.sql$/.test(file)).sort();

    for (const file of files) await db.exec(await readFile(path.join(root, 'supabase/migrations', file), 'utf8'));
  }
  const results = await db.exec(await readFile(path.join(root, 'supabase/tests/marketing_creative.test.sql'), 'utf8'));
  const { transpileModule, ModuleKind } = await import('typescript');
  const compile = source => transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext}}).outputText;
  const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const base = data(compile(await readFile(path.join(root,'lib/marketing/domain.ts'),'utf8')));
  const domain = compile(await readFile(path.join(root,'lib/marketing/creative-domain.ts'),'utf8')).replace('"@/lib/marketing/domain"',JSON.stringify(base));
  const { parseCreativeCommand } = await import(data(domain));
  let roundtrips=0;
  for (const result of results) for (const row of result.rows??[]) for (const value of Object.values(row)) {
    if (!value || typeof value!=='object' || !value.version) continue;
    if (value.scene && value.content_id) { parseCreativeCommand({action:'save_design',id:value.id,expected_version:value.version,title:value.title,scene:value.scene});roundtrips++; }
    if (value.storage_path) { parseCreativeCommand({action:'review_asset',id:value.id,expected_version:value.version,rights:value.rights,reason:value.rights_reason,allowed_channels:value.allowed_channels,valid_until:value.valid_until});roundtrips++; }
  }
  if(roundtrips<2) throw new Error('Missing SQL/API roundtrips');
  console.log(`${roundtrips} SQL/API validator roundtrips passed.`);
  console.log('Creative PostgreSQL regression tests passed (disposable Storage fixture).');
} catch(error) { console.error(error);process.exitCode=1; } finally { await db.close(); }
