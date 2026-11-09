-- Run only against the disposable test database.
begin;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'ASSERT: %', label; end if;
end;
$$;
create function pg_temp.denied(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate <> expected then raise exception 'Expected %, got %: %', expected, sqlstate, sqlerrm; end if;
    return;
  end;
  raise exception 'Unexpectedly permitted: %', statement;
end;
$$;

insert into auth.users (id,email) values
('60000000-0000-4000-8000-000000000001','hardening-admin@test.invalid'),
('60000000-0000-4000-8000-000000000002','hardening-rep@test.invalid'),
('60000000-0000-4000-8000-000000000003','hardening-viewer@test.invalid');
insert into public.profiles (id,email,status) select id,email,'active' from auth.users where email like 'hardening-%';
insert into public.user_roles (user_id,role) values
('60000000-0000-4000-8000-000000000001','Admin'),
('60000000-0000-4000-8000-000000000002','PR Representative'),
('60000000-0000-4000-8000-000000000003','Viewer');

select pg_temp.expect(not has_function_privilege('anon','public.marketing_readiness_probe()','execute'),'no anonymous probe');
select pg_temp.expect(not has_function_privilege('service_role','public.marketing_reserve_report_export()','execute'),'service cannot spend a user budget');
select pg_temp.expect(not has_table_privilege('authenticated','marketing_private.command_budgets','select,insert,update,delete'),'budget table private');
select pg_temp.expect(not has_function_privilege('authenticated',('marketing_private.'||fn||'(jsonb)'),'execute'),'no unmetered '||fn)
from unnest(array['command','knowledge_command','creative_command','publishing_command','video_command','report_command']) fn;
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select pg_temp.expect(public.marketing_readiness_probe()=case when to_regprocedure('public.marketing_mark_notification_read(uuid)') is not null then '20261109000100' when to_regprocedure('public.marketing_reserve_calendar_thumbnail()') is not null then '20261108000200' when to_regprocedure('public.marketing_task_command(jsonb)') is not null then '20261108000100' when to_regprocedure('public.marketing_campaign_kpi_command(jsonb)') is null then '20261106000100' else '20261106000200' end,'actual Admin schema marker');
select set_config('hardening.team',public.marketing_command('{"action":"create_team","name":"Hardening fixture"}')->>'id',true);
select public.marketing_command(jsonb_build_object('action','set_member','team_id',current_setting('hardening.team'),'user_id','60000000-0000-4000-8000-000000000002','enabled',true));
select set_config('hardening.campaign',public.marketing_command(jsonb_build_object('action','create_campaign','team_id',current_setting('hardening.team'),'name','QA Hold','kind','seasonal','objective','','audience','','message','','start_date',null,'end_date',null))->>'id',true);
select public.marketing_command(jsonb_build_object('action','submit_activation','id',current_setting('hardening.campaign'),'expected_version',1));
select public.marketing_command(jsonb_build_object('action','activate_campaign','id',current_setting('hardening.campaign'),'expected_version',2));
select pg_temp.denied($q$select public.marketing_command(jsonb_build_object('action','create_team','name',repeat('x',262144)))$q$,'22023');

reset role;
insert into marketing_private.command_budgets (actor_id,minute_bucket,budget,used)
select '60000000-0000-4000-8000-000000000002', floor(extract(epoch from clock_timestamp())/60)::bigint+delta, category, ceiling
from (values ('mutation',240),('report',12),('render',6)) x(category,ceiling)
cross join generate_series(0,1) delta;
insert into marketing_private.command_budgets (actor_id,minute_bucket,budget,used)
values ('60000000-0000-4000-8000-000000000003',floor(extract(epoch from clock_timestamp())/60)::bigint-1441,'export',10);

set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000002',true);
select pg_temp.denied('select public.marketing_readiness_probe()','42501');
select pg_temp.denied($q$select public.marketing_creative_command('{"action":"complete_asset"}')$q$,'P0429');
select pg_temp.denied($q$select public.marketing_report_command('{"action":"build_report"}')$q$,'P0429');
select pg_temp.denied($q$select public.marketing_video_command('{"action":"request_video_render"}')$q$,'P0429');
select pg_temp.denied($q$select marketing_private.command('{"action":"emergency_hold"}')$q$,'42501');
select pg_temp.denied($q$select marketing_private.metered_command('unknown','{}')$q$,'P0429');
select pg_temp.expect((public.marketing_command(jsonb_build_object('action','emergency_hold','id',current_setting('hardening.campaign'),'expected_version',3,'reason','QA verifies safety override'))->>'status')='emergency_hold','Hold executes despite depleted routine budget');

select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000003',true);
select pg_temp.denied($q$select public.marketing_command('{"action":"create_team","name":"Forbidden"}')$q$,'42501');
select public.marketing_reserve_report_export() from generate_series(1,10);
select pg_temp.denied('select public.marketing_reserve_report_export()','P0429');
reset role;
select pg_temp.expect(not exists (select 1 from marketing_private.command_budgets where actor_id='60000000-0000-4000-8000-000000000003' and minute_bucket < floor(extract(epoch from clock_timestamp())/60)::bigint-1440),'old actor counters pruned');
update public.profiles set status='locked' where id='60000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select pg_temp.denied('select public.marketing_readiness_probe()','42501');
select pg_temp.denied('select public.marketing_reserve_report_export()','42501');
reset role;
rollback;
