-- Real SQL behavior tests. Run only in a disposable database; the runner provisions it.
begin;
create schema marketing_test;
create function marketing_test.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %', label; end if; end $$;
create function marketing_test.reject(command jsonb, label text, expected_code text default null) returns void language plpgsql as $$
begin
  begin perform public.marketing_command(command);
  exception when others then
    if expected_code is not null and sqlstate<>expected_code then raise exception 'ASSERT %: expected %, got % (%)',label,expected_code,sqlstate,sqlerrm; end if;
    return; end;
  raise exception 'ASSERT accepted forbidden command: %', label;
end $$;
create function marketing_test.reject_sql(statement text, label text, expected_code text default '42501') returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if sqlstate<>expected_code then raise exception 'ASSERT %: expected %, got %',label,expected_code,sqlstate; end if;
  return;
 end;
 raise exception 'ASSERT accepted forbidden SQL: %',label;
end $$;
-- Positive fixtures explicitly complete nullable fields; negative RPC tests do not normalize.
create function marketing_test.complete(command jsonb) returns jsonb language sql immutable as $$
 select (case
 when command->>'action' in('create_campaign','update_campaign') then '{"objective":"","audience":"","message":"","start_date":null,"end_date":null}'::jsonb
 when command->>'action' in('create_content','update_content') then '{"assignee_id":null,"production_due_at":null,"review_due_at":null,"proposed_publish_at":null}'::jsonb
 else '{}'::jsonb end) || command;
$$;
create function marketing_test.command(command jsonb) returns jsonb language sql as $$
 select public.marketing_command(marketing_test.complete(command));
$$;
grant usage on schema marketing_test to authenticated;
grant execute on all functions in schema marketing_test to authenticated;

insert into auth.users(id,email) values
('10000000-0000-4000-8000-000000000001','marketing-admin@test.invalid'),
('10000000-0000-4000-8000-000000000002','marketing-leader@test.invalid'),
('10000000-0000-4000-8000-000000000003','marketing-member@test.invalid'),
('10000000-0000-4000-8000-000000000004','marketing-viewer@test.invalid'),
('10000000-0000-4000-8000-000000000005','marketing-outsider@test.invalid');
insert into public.profiles(id,email,status) select id,email,'active' from auth.users where email like 'marketing-%@test.invalid';
insert into public.user_roles(user_id,role) values
('10000000-0000-4000-8000-000000000001','Admin'),
('10000000-0000-4000-8000-000000000002','PR Leader'),
('10000000-0000-4000-8000-000000000003','PR Representative'),
('10000000-0000-4000-8000-000000000004','Viewer'),
('10000000-0000-4000-8000-000000000005','PR Leader');

select marketing_test.assert(to_regprocedure('public.marketing_command(jsonb)') is not null, 'mutation RPC exists');
select marketing_test.assert(not has_function_privilege('anon','public.marketing_command(jsonb)','execute'), 'anon cannot invoke');
select marketing_test.assert(not (select prosecdef from pg_proc where oid='public.marketing_command(jsonb)'::regprocedure), 'entrypoint is invoker');
select marketing_test.assert(not has_table_privilege('authenticated','public.marketing_campaigns','insert,update,delete'), 'client has no direct DML');
select marketing_test.assert(not has_table_privilege('anon','public.marketing_campaigns','select'), 'anon cannot read');

set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select marketing_test.reject('{"action":"create_team","name":"No identity"}', 'missing identity');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select marketing_test.reject('{"action":"create_team","name":true}', 'non string team name', '22023');
select marketing_test.reject(jsonb_build_object('action','create_team','name',E'\n\t'),'JavaScript whitespace-only name rejected');
select set_config('marketing_test.team', marketing_test.command('{"action":"create_team","name":"Team A"}')->>'id',true);
select set_config('marketing_test.other_team', marketing_test.command('{"action":"create_team","name":"Team B"}')->>'id',true);
select marketing_test.command(jsonb_build_object('action','set_member','team_id',current_setting('marketing_test.team'),'user_id',id,'enabled',true))
from (values('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003'),('10000000-0000-4000-8000-000000000004')) u(id);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select marketing_test.reject('{"action":"create_team","name":"Forbidden"}', 'member cannot create team','42501');
select set_config('marketing_test.campaign', marketing_test.command(jsonb_build_object('action','create_campaign','team_id',current_setting('marketing_test.team'),'name','Campaign','kind','seasonal','objective','','audience','','message','','start_date',null,'end_date',null))->>'id',true);
select marketing_test.assert((select count(*)=1 from public.marketing_teams),'member reads only own team');
-- Direct RPC validation must never persist a value the HTTP editor cannot resave.
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_campaign','team_id',current_setting('marketing_test.team'),'name',repeat('x',181),'kind','seasonal')), 'campaign name max180');
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_campaign','team_id',current_setting('marketing_test.team'),'name','Locale date','kind','seasonal','start_date','11/04/2026')), 'date requires YYYY-MM-DD');
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_campaign','team_id',current_setting('marketing_test.team'),'name','Missing date','kind','seasonal'))-'start_date', 'nullable date must be explicit','22023');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan',repeat('x',50001),'content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft','[]'::jsonb), 'plan max50000');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft',(select jsonb_agg(jsonb_build_object('name','KPI','unit','posts','target',1)) from generate_series(1,13))), 'KPI max12');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft',jsonb_build_array(jsonb_build_object('name',repeat('x',121),'unit','posts','target',1))), 'KPI name max120');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft',jsonb_build_array(jsonb_build_object('name','KPI','unit',repeat('x',41),'target',1))), 'KPI unit max40');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft','[{"name":"KPI","unit":" ","target":1}]'::jsonb), 'KPI unit required');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft','[{"name":"KPI","unit":"posts","target":1000000000001}]'::jsonb), 'KPI target max1e12');
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.campaign'),'title',repeat('x',181),'caption','','content_line','Meme','production_status','writing')), 'content title max180');
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.campaign'),'title','Caption','caption',repeat('x',12001),'content_line','Meme','production_status','writing')), 'caption max12000');
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.campaign'),'title','Timestamp','caption','','content_line','Meme','production_status','writing','proposed_publish_at','2026-11-04T16:00')), 'timestamp requires explicit timezone','22023');
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.campaign'),'title','Timestamp','caption','','content_line','Meme','production_status','writing','proposed_publish_at','2026-11-04T24:00:00Z')), 'timestamp cannot normalize invalid hour','22023');
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.campaign'),'title','Missing nullable','caption','','content_line','Meme','production_status','writing'))-'assignee_id', 'nullable assignee must be explicit','22023');

select marketing_test.reject(jsonb_build_object('action','create_campaign','team_id',current_setting('marketing_test.other_team'),'name','Intrusion','kind','seasonal'), 'cross team write');
select marketing_test.reject_sql('update public.marketing_campaigns set creator_id=auth.uid()', 'direct campaign update');
select marketing_test.reject_sql('insert into public.marketing_audit_logs select * from public.marketing_audit_logs', 'direct audit insert');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','bad','content_mix','{"ColorMAP":30,"Sharing":30,"Meme":30,"InsideME":30}'::jsonb,'kpi_draft','[]'::jsonb),'invalid mix');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','bad','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25,"extra":0}'::jsonb,'kpi_draft','[]'::jsonb),'extra mix key');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','bad','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft','[{"name":"Bad","target":-1,"unit":"posts"}]'::jsonb),'negative KPI');
select marketing_test.command(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',1,'plan','v2','content_mix','{"ColorMAP":40,"Sharing":30,"Meme":20,"InsideME":10}'::jsonb,'kpi_draft','[{"name":"Posts","target":12,"unit":"posts"}]'::jsonb));
select marketing_test.reject(jsonb_build_object('action','submit_activation','id',current_setting('marketing_test.campaign'),'expected_version',1),'stale version','40001');
select marketing_test.command(jsonb_build_object('action','submit_activation','id',current_setting('marketing_test.campaign'),'expected_version',2));
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',3,'plan','tampered','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft','[]'::jsonb),'pending plan frozen');
select marketing_test.reject(jsonb_build_object('action','activate_campaign','id',current_setting('marketing_test.campaign'),'expected_version',3),'member cannot activate','42501');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select marketing_test.assert((select count(*)=0 from public.marketing_campaigns),'outsider sees no campaigns');
select marketing_test.reject(jsonb_build_object('action','activate_campaign','id',current_setting('marketing_test.campaign'),'expected_version',3),'other team leader cannot activate');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select marketing_test.command(jsonb_build_object('action','activate_campaign','id',current_setting('marketing_test.campaign'),'expected_version',3));
select marketing_test.assert((select official_kpis=kpi_draft and status='active' and version=4 from public.marketing_campaigns where id=current_setting('marketing_test.campaign')::uuid),'activation freezes exact KPI');
select marketing_test.reject(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',4,'plan','changed','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft','[]'::jsonb),'official KPI cannot change');
select marketing_test.command(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.campaign'),'expected_version',4,'plan','active edit','content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft','[{"name":"Posts","target":12,"unit":"posts"}]'::jsonb));
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('marketing_test.content',marketing_test.command(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.campaign'),'title','Content','caption','Draft','content_line','ColorMAP','assignee_id','10000000-0000-4000-8000-000000000003','production_status','writing','proposed_publish_at','2026-11-04T18:00:00+07:00'))->>'id',true);
select marketing_test.reject(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.campaign'),'title','Bad assignee','caption','','content_line','Meme','production_status','not_started','assignee_id','10000000-0000-4000-8000-000000000005'),'outsider assignee');
select marketing_test.reject(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.campaign'),'title','Infinite date','caption','','content_line','Meme','production_status','not_started','proposed_publish_at','infinity'),'calendar timestamp must be finite');
select marketing_test.command(jsonb_build_object('action','submit_review','id',current_setting('marketing_test.content'),'expected_version',1));
select marketing_test.command(jsonb_build_object('action','update_content','id',current_setting('marketing_test.content'),'expected_version',2,'title','Edited','caption','Revised','content_line','Sharing','assignee_id',null,'production_status','editing','proposed_publish_at','2026-11-04T18:00:00+07:00'));
select marketing_test.assert((select publishing_status='draft' and version=3 and creator_id='10000000-0000-4000-8000-000000000003' and proposed_publish_at='2026-11-04T11:00:00Z'::timestamptz from public.marketing_content_items where id=current_setting('marketing_test.content')::uuid),'edit invalidates review and preserves creator and UTC instant');
select marketing_test.reject(jsonb_build_object('action','approve_content','id',current_setting('marketing_test.content'),'expected_version',3),'no approval endpoint');
select marketing_test.reject(jsonb_build_object('action','update_content','id',current_setting('marketing_test.content'),'expected_version',3,'creator_id','10000000-0000-4000-8000-000000000001'),'creator forgery','22023');
select marketing_test.command(jsonb_build_object('action','emergency_hold','id',current_setting('marketing_test.campaign'),'expected_version',5,'reason','Rights concern'));
select marketing_test.reject(jsonb_build_object('action','resume_campaign','id',current_setting('marketing_test.campaign'),'expected_version',6),'member cannot resume');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select marketing_test.command(jsonb_build_object('action','resume_campaign','id',current_setting('marketing_test.campaign'),'expected_version',6));
select marketing_test.assert((select publishing_status='draft' and proposed_publish_at='2026-11-04T11:00:00Z'::timestamptz from public.marketing_content_items where id=current_setting('marketing_test.content')::uuid),'resume never reschedules content');
select marketing_test.assert((select count(*)=7 from public.marketing_revisions where entity_id=current_setting('marketing_test.campaign')::uuid),'campaign versions append');
select marketing_test.assert((select count(*)=3 from public.marketing_revisions where entity_id=current_setting('marketing_test.content')::uuid),'content versions append');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select marketing_test.assert((select count(*)=1 from public.marketing_campaigns),'scoped viewer can read');
select set_config('request.headers','{"x-clm-active-role":"Admin"}',true);
select set_config('request.jwt.claims','{"role":"Admin","app_metadata":{"roles":["Admin"]}}',true);
select marketing_test.reject(jsonb_build_object('action','emergency_hold','id',current_setting('marketing_test.campaign'),'expected_version',7,'reason','viewer'),'forged headers/claims do not grant real DB role','42501');
reset role;
update public.profiles set status='locked' where id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select marketing_test.assert((select count(*)=0 from public.marketing_campaigns),'locked user cannot read');
select marketing_test.reject(jsonb_build_object('action','submit_review','id',current_setting('marketing_test.content'),'expected_version',3),'locked user cannot mutate');
reset role;
update public.profiles set status='active' where id='10000000-0000-4000-8000-000000000003';
delete from public.user_roles where user_id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select marketing_test.assert((select count(*)=0 from public.marketing_campaigns),'revoked role blocks reads');
select marketing_test.reject(jsonb_build_object('action','submit_review','id',current_setting('marketing_test.content'),'expected_version',3),'revoked role blocks mutation','42501');
reset role;
insert into public.user_roles values('10000000-0000-4000-8000-000000000003','PR Representative');
delete from public.marketing_team_memberships where user_id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select marketing_test.assert((select count(*)=0 from public.marketing_campaigns),'revoked membership immediately blocks reads');
select marketing_test.reject(jsonb_build_object('action','submit_review','id',current_setting('marketing_test.content'),'expected_version',3),'revoked membership blocks mutation');
reset role;
select marketing_test.reject_sql('update public.marketing_revisions set snapshot=''{}''', 'history immutable even for owner');
select marketing_test.reject_sql('delete from public.marketing_audit_logs', 'audit immutable even for owner');
select marketing_test.reject_sql(format('insert into public.marketing_approval_snapshots(team_id,content_id,creator_id,approver_id,content_version,snapshot) values(%L,%L,%L,%L,3,''{}'')',current_setting('marketing_test.team'),current_setting('marketing_test.content'),'10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003'), 'self approval snapshot check','23514');
select marketing_test.assert((select count(*)=count(distinct (entity_type,entity_id,version)) from public.marketing_revisions),'revision versions unique');
select marketing_test.assert((select count(*)=10 from public.marketing_audit_logs where entity_type in('campaign','content')),'successful entity writes audited atomically only');
-- Exercise remaining supported commands independently after the initial atomicity counts.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('marketing_test.second',marketing_test.command(jsonb_build_object('action','create_campaign','team_id',current_setting('marketing_test.team'),'name','Second','kind','always_on'))->>'id',true);
select marketing_test.command(jsonb_build_object('action','update_campaign','id',current_setting('marketing_test.second'),'expected_version',1,'name','Second renamed','kind','seasonal','objective','Goal','audience','Audience','message','Message','start_date','2026-11-01','end_date','2026-12-01'));
select marketing_test.reject(jsonb_build_object('action','update_campaign','id',current_setting('marketing_test.second'),'expected_version',2,'name','Bad','kind','seasonal','team_id',current_setting('marketing_test.other_team')),'scope forgery','22023');
-- Assignment must use a currently active application identity, not a stale membership alone.
reset role;
delete from public.user_roles where user_id='10000000-0000-4000-8000-000000000004';
set local role authenticated;
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.second'),'title','Roleless assignee','caption','','content_line','Meme','production_status','writing','assignee_id','10000000-0000-4000-8000-000000000004')),'roleless assignee is unavailable','22023');
reset role;
insert into public.user_roles values('10000000-0000-4000-8000-000000000004','Viewer');
set local role authenticated;
select set_config('marketing_test.second_content',marketing_test.command(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.second'),'title','Reviewable','caption','Text','content_line','Meme','production_status','ready'))->>'id',true);
select marketing_test.command(jsonb_build_object('action','submit_review','id',current_setting('marketing_test.second_content'),'expected_version',1));
select marketing_test.command(jsonb_build_object('action','request_changes','id',current_setting('marketing_test.second_content'),'expected_version',2,'reason','Clarify source'));
select marketing_test.assert((select publishing_status='changes_requested' and version=3 from public.marketing_content_items where id=current_setting('marketing_test.second_content')::uuid),'request changes remains separate from production status');
select marketing_test.command(jsonb_build_object('action','submit_activation','id',current_setting('marketing_test.second'),'expected_version',2));
select marketing_test.command(jsonb_build_object('action','activate_campaign','id',current_setting('marketing_test.second'),'expected_version',3));
select marketing_test.command(jsonb_build_object('action','pause_campaign','id',current_setting('marketing_test.second'),'expected_version',4));
select marketing_test.command(jsonb_build_object('action','resume_campaign','id',current_setting('marketing_test.second'),'expected_version',5));
select marketing_test.command(jsonb_build_object('action','complete_campaign','id',current_setting('marketing_test.second'),'expected_version',6));
select marketing_test.command(jsonb_build_object('action','archive_campaign','id',current_setting('marketing_test.second'),'expected_version',7));
select marketing_test.assert((select status='archived' and version=8 and creator_id=activated_by from public.marketing_campaigns where id=current_setting('marketing_test.second')::uuid),'campaign self activation is allowed; archive recorded');
select marketing_test.reject(jsonb_build_object('action','resume_campaign','id',current_setting('marketing_test.second'),'expected_version',8),'archived campaign cannot resume','22023');
-- Accepted maximum values are returned to the runner for real domain-validator roundtrips.
select set_config('marketing_test.boundary',marketing_test.command(jsonb_build_object('action','create_campaign','team_id',current_setting('marketing_test.team'),'name',repeat('x',180),'kind','always_on'))->>'id',true);
select marketing_test.command(jsonb_build_object('action','update_plan','id',current_setting('marketing_test.boundary'),'expected_version',1,'plan',repeat('p',50000),'content_mix','{"ColorMAP":25,"Sharing":25,"Meme":25,"InsideME":25}'::jsonb,'kpi_draft',(select jsonb_agg(jsonb_build_object('name',repeat('k',120),'unit',repeat('u',40),'target',1000000000000)) from generate_series(1,12))));
select marketing_test.command(jsonb_build_object('action','create_content','campaign_id',current_setting('marketing_test.boundary'),'title',repeat('t',180),'caption',repeat('c',12000),'content_line','Meme','production_status','writing','proposed_publish_at','2026-11-04T16:00:00+07:00'));
select marketing_test.reject(marketing_test.complete(jsonb_build_object('action','create_campaign','team_id',current_setting('marketing_test.team'),'name',repeat('😀',91),'kind','seasonal')),'UTF16 campaign name limit','22023');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select marketing_test.command(jsonb_build_object('action','set_member','team_id',current_setting('marketing_test.team'),'user_id','10000000-0000-4000-8000-000000000004','enabled',false));
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select marketing_test.assert((select count(*)=0 from public.marketing_teams),'Admin membership removal is effective');
reset role;
rollback;
