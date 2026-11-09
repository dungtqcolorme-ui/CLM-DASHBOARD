begin;
create function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'ASSERT: %',label; end if; end;
$$;
insert into auth.users(id,email) values
('83000000-0000-4000-8000-000000000001','notice-admin@test.invalid'),
('83000000-0000-4000-8000-000000000002','notice-author@test.invalid'),
('83000000-0000-4000-8000-000000000003','notice-leader@test.invalid'),
('83000000-0000-4000-8000-000000000004','notice-outsider@test.invalid'),
('83000000-0000-4000-8000-000000000005','notice-assignee@test.invalid');
insert into public.profiles(id,email,status)
  select id,email,'active' from auth.users where email like 'notice-%';
insert into public.user_roles(user_id,role) values
('83000000-0000-4000-8000-000000000001','Admin'),
('83000000-0000-4000-8000-000000000002','PR Representative'),
('83000000-0000-4000-8000-000000000002','PR Leader'),
('83000000-0000-4000-8000-000000000003','PR Leader'),
('83000000-0000-4000-8000-000000000004','PR Leader'),
('83000000-0000-4000-8000-000000000005','Viewer');
insert into public.marketing_teams(id,name,creator_id) values
('83000000-0000-4000-8000-000000000010','Notice team','83000000-0000-4000-8000-000000000001');
insert into public.marketing_team_memberships(team_id,user_id)
  select '83000000-0000-4000-8000-000000000010',id from auth.users
  where email in ('notice-author@test.invalid','notice-leader@test.invalid','notice-assignee@test.invalid');
insert into public.marketing_campaigns(id,team_id,name,kind,creator_id) values
('83000000-0000-4000-8000-000000000020','83000000-0000-4000-8000-000000000010','Notice fixture','always_on','83000000-0000-4000-8000-000000000001');
insert into public.marketing_content_items(id,campaign_id,team_id,creator_id,assignee_id,title,caption,content_line,production_status)
values ('83000000-0000-4000-8000-000000000030','83000000-0000-4000-8000-000000000020','83000000-0000-4000-8000-000000000010',
'83000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000005','Notice content','Caption fixture','Sharing','writing');

select pg_temp.expect(not has_table_privilege('authenticated','public.marketing_notifications','insert,update,delete'),'client cannot write notices');
select pg_temp.expect(not has_function_privilege('anon','public.marketing_mark_notification_read(uuid)','execute'),'no anonymous read receipt');

set local role authenticated;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000002',true);
select public.marketing_command('{"action":"submit_review","id":"83000000-0000-4000-8000-000000000030","expected_version":1}'::jsonb);
select pg_temp.expect((select count(*)=0 from public.marketing_notifications),'creator with Leader role excluded from own review');
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000004',true);
select pg_temp.expect((select count(*)=0 from public.marketing_notifications),'outside Leader sees no notification');
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000003',true);
select pg_temp.expect((select count(*)=1 from public.marketing_notifications where kind='review_requested' and content_version=2),'Leader receives exact submitted version');
select set_config('notice.leader_id',(select id::text from public.marketing_notifications),true);
select public.marketing_command('{"action":"request_changes","id":"83000000-0000-4000-8000-000000000030","expected_version":2,"reason":"Review fixture"}'::jsonb);
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000005',true);
select pg_temp.expect((select count(*)=1 from public.marketing_notifications where kind='changes_requested' and content_version=3),'assignee receives requested change');
select pg_temp.expect(public.marketing_mark_notification_read(current_setting('notice.leader_id')::uuid) is null,'cannot mark another recipient');
select set_config('notice.viewer_id',(select id::text from public.marketing_notifications),true);
select set_config('notice.marked_at',public.marketing_mark_notification_read(current_setting('notice.viewer_id')::uuid)::text,true);
select pg_temp.expect(nullif(current_setting('notice.marked_at'),'') is not null,'recipient can mark read');
select pg_temp.expect(public.marketing_mark_notification_read(current_setting('notice.viewer_id')::uuid)::text=current_setting('notice.marked_at'),'mark read retry preserves time');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000001',true);
select public.marketing_command('{"action":"submit_activation","id":"83000000-0000-4000-8000-000000000020","expected_version":1}'::jsonb);
select public.marketing_command('{"action":"activate_campaign","id":"83000000-0000-4000-8000-000000000020","expected_version":2}'::jsonb);
select public.marketing_command('{"action":"emergency_hold","id":"83000000-0000-4000-8000-000000000020","expected_version":3,"reason":"Fixture pause"}'::jsonb);
reset role;
insert into public.marketing_publishing_incidents(team_id,campaign_id,content_id,kind,severity,message,dedupe_key) values
('83000000-0000-4000-8000-000000000010','83000000-0000-4000-8000-000000000020','83000000-0000-4000-8000-000000000030',
'unknown','critical','Fixture private detail','notice-fixture');
update public.marketing_publishing_incidents set status='acknowledged' where dedupe_key='notice-fixture';
select pg_temp.expect((select count(*)=4 from public.marketing_notifications where kind='critical_incident'),'critical delivered once to managers and assignee');
set local role authenticated;
select set_config('request.jwt.claim.sub','83000000-0000-4000-8000-000000000003',true);
select pg_temp.expect((select count(*)=3 from public.marketing_notifications),'Leader sees review, Hold and critical incident');
reset role;
delete from public.marketing_team_memberships where user_id='83000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.expect((select count(*)=0 from public.marketing_notifications),'revoked member loses existing notices');
select pg_temp.expect(public.marketing_mark_notification_read(current_setting('notice.leader_id')::uuid) is null,'revoked member cannot mark existing notices');
reset role;
rollback;
