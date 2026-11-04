/** Disposable PostgreSQL regression runner. No network/database URL is accepted.
 * Use MARKETING_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js
 * for an external test-only installation; this adds no application dependency.
 */
import { readFile } from 'node:fs/promises';
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
  await db.exec(await readFile(path.join(root, 'supabase/migrations/20261104000100_marketing_foundation.sql'), 'utf8'));
  if (!process.argv.includes('--without-migration')) await db.exec(await readFile(path.join(root, 'supabase/migrations/20261104000200_marketing_knowledge.sql'), 'utf8'));
  const results = await db.exec(await readFile(path.join(root, 'supabase/tests/marketing_knowledge.test.sql'), 'utf8'));
  const { routeLoader } = await import('../tests/helpers/load-route.mjs');
  const { parseKnowledgeCommand } = routeLoader({})('lib/marketing/knowledge-domain.ts');
  let roundtrips = 0;
  for (const result of results) for (const row of result.rows ?? []) for (const [name, value] of Object.entries(row)) {
    if (!name.startsWith('roundtrip_')) continue;
    const pick = (keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
    if (name === 'roundtrip_source') parseKnowledgeCommand({action:'create_source', ...pick(['team_id','title','kind','url','excerpt','author','published_at'])});
    else if (name === 'roundtrip_idea') parseKnowledgeCommand({action:'update_idea',id:value.id,expected_version:value.version,...pick(['title','objective','hook','caption','content_line','rationale','planned_for']),fact_ids:value.evidence.map(ref=>ref.fact_id)});
    else if (name === 'roundtrip_fact') parseKnowledgeCommand({action:'create_fact',...pick(['source_id','claim','claim_type','category','valid_until'])});
    else if (name === 'roundtrip_run') parseKnowledgeCommand({action:'run_research',...pick(['campaign_id','mode','query'])});
    else if (name === 'roundtrip_proposal') parseKnowledgeCommand({action:'propose_dna',...pick(['scope','team_id','content_id','base_version','proposed','reason'])});
    else throw new Error(`Unknown roundtrip fixture ${name}`);
    roundtrips++;
  }
  if (roundtrips !== 7) throw new Error(`Expected 7 actual max-value knowledge RPC roundtrips, got ${roundtrips}`);
  console.log(`Marketing knowledge PostgreSQL behavioral/security tests passed (disposable PGlite; ${roundtrips} max-value HTTP-validator roundtrips).`);
} catch (error) {
  console.error(`Marketing PostgreSQL test failed [${error.code ?? 'runtime'}]: ${error.message}`);
  if (error.where) console.error(error.where);
  if (error.position && error.query) console.error(error.query.slice(Math.max(0, Number(error.position) - 150), Number(error.position) + 150));
  process.exitCode = 1;
} finally {
  await db.close();
}
