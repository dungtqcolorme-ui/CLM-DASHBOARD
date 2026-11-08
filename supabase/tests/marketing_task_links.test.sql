begin;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end;
$$;
create function pg_temp.reject(payload jsonb, expected text) returns void language plpgsql as $$
begin
  begin perform public.marketing_task_command(payload);
  exception when others then
    if sqlstate <> expected then raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm; end if;
    return;
  end;
  raise exception 'Unexpected Task link success';
end;
$$;
insert into auth.users(id,email) values
('81000000-0000-4000-8000-000000000001','task-admin@test.invalid'),
('81000000-0000-4000-8000-000000000002','task-rep@test.invalid'),
('81000000-0000-4000-8000-000000000003','task-viewer@test.invalid'),
('81000000-0000-4000-8000-000000000004','task-outsider@test.invalid');
insert into public.profiles(id,email,status) select id,email,'active' from auth.users where email like 'task-%';
insert into public.user_roles(user_id,role) values
('81000000-0000-4000-8000-000000000001','Admin'),
('81000000-0000-4000-8000-000000000002','PR Representative'),
('81000000-0000-4000-8000-000000000003','Viewer'),
('81000000-0000-4000-8000-000000000004','PR Leader');
insert into public.marketing_teams(id,name,creator_id) values
('81000000-0000-4000-8000-000000000010','Link team','81000000-0000-4000-8000-000000000001');
insert into public.marketing_team_memberships(team_id,user_id) values
('81000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000002'),
('81000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000003');
insert into public.marketing_campaigns(id,team_id,name,kind,creator_id) values
('81000000-0000-4000-8000-000000000020','81000000-0000-4000-8000-000000000010','Task fixture','always_on','81000000-0000-4000-8000-000000000001');
insert into public.marketing_content_items(id,campaign_id,team_id,creator_id,title,content_line,production_status,version) values
('81000000-0000-4000-8000-000000000030','81000000-0000-4000-8000-000000000020','81000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000002','Task content','Sharing','writing',7);
insert into public.tasks(id,title,owner_id,created_by,deadline,status) values
('T-link-fixture','Task gốc','81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','2026-11-10','Đang thực hiện');
select set_config('link.source_task',(select to_jsonb(t)::text from public.tasks t where id='T-link-fixture'),true);
select set_config('link.source_content',(select to_jsonb(c)::text from public.marketing_content_items c where id='81000000-0000-4000-8000-000000000030'),true);
select set_config('link.command','{"action":"link_task","content_id":"81000000-0000-4000-8000-000000000030","task_id":"T-link-fixture","expected_link_version":0}',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select set_config('link.saved',public.marketing_task_command(current_setting('link.command')::jsonb)::text,true);
select pg_temp.expect(public.marketing_task_command(current_setting('link.command')::jsonb)->>'id'=current_setting('link.saved')::jsonb->>'id','retry is idempotent');
select pg_temp.expect((select count(*)=1 from public.marketing_task_links),'one link');
select pg_temp.expect((select count(*)=1 from public.marketing_task_link_events),'one link audit');
select pg_temp.reject(current_setting('link.command')::jsonb||'{"task_id":"missing"}','22023');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000003',true);
select pg_temp.expect((select count(*)=1 from public.marketing_task_links),'Viewer can read scoped links');
select pg_temp.reject(current_setting('link.command')::jsonb,'42501');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000004',true);
select pg_temp.expect((select count(*)=0 from public.marketing_task_links),'outside team cannot read');
select pg_temp.reject(current_setting('link.command')::jsonb,'42501');
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select pg_temp.reject(jsonb_build_object('action','unlink_task','id',current_setting('link.saved')::jsonb->>'id','expected_version',2,'reason','Sai liên kết'),'40001');
select public.marketing_task_command(jsonb_build_object('action','unlink_task','id',current_setting('link.saved')::jsonb->>'id','expected_version',1,'reason','Gỡ liên kết minh họa'));
select pg_temp.reject(current_setting('link.command')::jsonb,'40001');
select public.marketing_task_command(current_setting('link.command')::jsonb||'{"expected_link_version":2}');
select pg_temp.expect((select to_jsonb(t)::text=current_setting('link.source_task') from public.tasks t where id='T-link-fixture'),'link commands preserve legacy Task exactly');
select pg_temp.expect((select to_jsonb(c)::text=current_setting('link.source_content') from public.marketing_content_items c where id='81000000-0000-4000-8000-000000000030'),'link commands preserve content and approval version');
reset role;
update public.tasks set status='Hoàn thành' where id='T-link-fixture';
select pg_temp.expect((select publishing_status='draft' and version=7 from public.marketing_content_items where id='81000000-0000-4000-8000-000000000030'),'completion does not approve or publish content');
update public.tasks set deleted_at=now() where id='T-link-fixture';
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000000002',true);
select pg_temp.reject(current_setting('link.command')::jsonb||'{"expected_link_version":3}','22023');
reset role;
select pg_temp.expect(not has_function_privilege('anon','public.marketing_task_command(jsonb)','execute'),'anonymous RPC denied');
select pg_temp.expect(not has_table_privilege('authenticated','public.marketing_task_links','insert,update,delete'),'direct link mutation denied');
insert into public.marketing_content_items(id,campaign_id,team_id,creator_id,title,content_line,production_status)
values('81000000-0000-4000-8000-000000000031','81000000-0000-4000-8000-000000000020','81000000-0000-4000-8000-000000000010','81000000-0000-4000-8000-000000000002','Capacity fixture','Sharing','writing');
insert into public.tasks(id,title,owner_id,created_by,deadline,status)
select 'T-cap-'||n,'Capacity Task','81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','2026-11-10','Đang thực hiện'
from generate_series(1,21) n;
set local role authenticated;
select public.marketing_task_command(jsonb_build_object('action','link_task','content_id','81000000-0000-4000-8000-000000000031','task_id','T-cap-'||n,'expected_link_version',0))
from generate_series(1,20) n;
select pg_temp.reject('{"action":"link_task","content_id":"81000000-0000-4000-8000-000000000031","task_id":"T-cap-21","expected_link_version":0}','22023');
reset role;
delete from public.marketing_team_memberships where user_id='81000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.expect((select count(*)=0 from public.marketing_task_links),'revoked member cannot read links');
select pg_temp.reject(current_setting('link.command')::jsonb,'42501');
reset role;
rollback;
