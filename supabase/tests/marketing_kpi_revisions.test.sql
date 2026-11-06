begin;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'ASSERT: %', label; end if;
end;
$$;
create function pg_temp.reject(command jsonb, expected text) returns void language plpgsql as $$
begin
  begin perform public.marketing_campaign_kpi_command(command);
  exception when others then
    if sqlstate <> expected then raise exception 'Expected %, got %: %', expected, sqlstate, sqlerrm; end if;
    return;
  end;
  raise exception 'Unexpected KPI command success: %', command->>'action';
end;
$$;

insert into auth.users(id,email) values
('71000000-0000-4000-8000-000000000001','kpi-admin@test.invalid'),
('71000000-0000-4000-8000-000000000002','kpi-rep@test.invalid'),
('71000000-0000-4000-8000-000000000003','kpi-leader@test.invalid'),
('71000000-0000-4000-8000-000000000004','kpi-outside@test.invalid'),
('71000000-0000-4000-8000-000000000005','kpi-viewer@test.invalid');
insert into public.profiles(id,email,status) select id,email,'active' from auth.users where email like 'kpi-%';
insert into public.user_roles(user_id,role) values
('71000000-0000-4000-8000-000000000001','Admin'),
('71000000-0000-4000-8000-000000000002','PR Representative'),
('71000000-0000-4000-8000-000000000003','PR Leader'),
('71000000-0000-4000-8000-000000000004','PR Leader'),
('71000000-0000-4000-8000-000000000005','Viewer');
insert into public.marketing_teams(id,name,creator_id) values
('71000000-0000-4000-8000-000000000010','KPI team','71000000-0000-4000-8000-000000000001');
insert into public.marketing_team_memberships(team_id,user_id)
select '71000000-0000-4000-8000-000000000010', id from public.profiles where id in
('71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000005');
insert into public.marketing_campaigns(id,team_id,name,kind,status,creator_id,official_kpis,kpi_draft,activated_by,activated_at,version)
values ('71000000-0000-4000-8000-000000000020','71000000-0000-4000-8000-000000000010','Existing active campaign','seasonal','active',
'71000000-0000-4000-8000-000000000001','[{"name":"Bài đăng","target":10,"unit":"bài"}]','[{"name":"Bài đăng","target":10,"unit":"bài"}]',
'71000000-0000-4000-8000-000000000001',now(),12);
select set_config('kpi.proposal','{"action":"propose_kpi_revision","id":"71000000-0000-4000-8000-000000000020","expected_kpi_version":0,"reason":"Điều chỉnh phạm vi sản xuất","targets":[{"name":"Bài đăng","target":12,"unit":"bài"}]}',true);
select set_config('kpi.confirm','{"action":"confirm_kpi_revision","id":"71000000-0000-4000-8000-000000000020","expected_kpi_version":1,"confirmed":true}',true);

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select pg_temp.expect((public.marketing_campaign_kpi_command(current_setting('kpi.proposal')::jsonb)->>'kpi_revision_version')::int=1,'Representative submits a persistent proposal');
select pg_temp.expect((select effective_kpi_revision is null and official_kpis->0->>'target'='10' and version=12 from public.marketing_campaigns),'proposal preserves baseline and campaign version');
select pg_temp.reject(current_setting('kpi.proposal')::jsonb,'40001');
select pg_temp.reject(current_setting('kpi.confirm')::jsonb,'42501');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
select pg_temp.reject(current_setting('kpi.confirm')::jsonb,'42501');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000005',true);
select pg_temp.reject(current_setting('kpi.confirm')::jsonb,'42501');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select pg_temp.reject(current_setting('kpi.confirm')::jsonb||'{"confirmed":false}','22023');
select pg_temp.reject(current_setting('kpi.confirm')::jsonb||'{"targets":[]}','22023');
select pg_temp.expect((public.marketing_campaign_kpi_command(current_setting('kpi.confirm')::jsonb)->>'kpi_revision_version')::int=2,'Leader confirms exact proposal');
select pg_temp.expect((select effective_kpi_revision->'targets'->0->>'target'='12'
  and effective_kpi_revision->'previous_targets'->0->>'target'='10'
  and effective_kpi_revision->>'confirmed_by'=auth.uid()::text
  and effective_kpi_revision->>'proposed_by'='71000000-0000-4000-8000-000000000002'
  and pending_kpi_revision is null and official_kpis->0->>'target'='10' and version=12
  from public.marketing_campaigns),'confirmation records before/after/actors without invalidating publishing version');
select pg_temp.reject(current_setting('kpi.confirm')::jsonb,'40001');
select pg_temp.expect((select count(*)=2 from public.marketing_revisions where entity_type='campaign_kpi'),'proposal and confirmation audit history');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
select pg_temp.expect((select count(*)=0 from public.marketing_revisions where entity_type='campaign_kpi'),'other team cannot read KPI history');
reset role;
rollback;
