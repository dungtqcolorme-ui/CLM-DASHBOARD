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
  if (!process.argv.includes('--without-migration')) {
    const files = (await readdir(path.join(root, 'supabase/migrations'))).filter(file => file.endsWith('_marketing_foundation.sql')).sort();
    if (files.length !== 1) throw new Error(`Expected one marketing foundation migration; found ${files.length}`);
    await db.exec(await readFile(path.join(root, 'supabase/migrations', files[0]), 'utf8'));
  }
  const results = await db.exec(await readFile(path.join(root, 'supabase/tests/marketing_foundation.test.sql'), 'utf8'));
  // Read actual RPC JSON through the same validator used by HTTP/UI saves. In particular,
  // accepted maximum lengths and UTC timestamps must remain editable after a reread.
  const { transpileModule, ModuleKind } = await import('typescript');
  const { outputText } = transpileModule(await readFile(path.join(root, 'lib/marketing/domain.ts'), 'utf8'), {
    compilerOptions: { module: ModuleKind.ESNext },
  });
  const { parseMarketingCommand } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  let roundtrips = 0;
  for (const result of results) for (const row of result.rows ?? []) for (const value of Object.values(row)) {
    if (!value || typeof value !== 'object' || !value.version) continue;
    const pick = (keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
    if (value.kind) {
      parseMarketingCommand({ action: 'update_campaign', id: value.id, expected_version: value.version,
        ...pick(['name', 'kind', 'objective', 'audience', 'message', 'start_date', 'end_date']) });
      parseMarketingCommand({ action: 'update_plan', id: value.id, expected_version: value.version,
        ...pick(['content_mix', 'plan', 'kpi_draft']) });
      roundtrips += 2;
    } else if (value.content_line) {
      parseMarketingCommand({ action: 'update_content', id: value.id, expected_version: value.version,
        ...pick(['title', 'caption', 'content_line', 'assignee_id', 'production_status', 'production_due_at', 'review_due_at', 'proposed_publish_at']) });
      roundtrips += 1;
    }
  }
  if (roundtrips < 20) throw new Error(`Expected actual RPC roundtrip coverage; got ${roundtrips}`);
  console.log(`Marketing PostgreSQL regression tests passed (disposable PGlite; ${roundtrips} HTTP-validator roundtrips).`);
} catch (error) {
  console.error(`Marketing PostgreSQL test failed [${error.code ?? 'runtime'}]: ${error.message}`);
  if (error.where) console.error(error.where);
  if (error.position && error.query) console.error(error.query.slice(Math.max(0, Number(error.position) - 150), Number(error.position) + 150));
  process.exitCode = 1;
} finally {
  await db.close();
}
