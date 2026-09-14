-- Run against the configured database. Every mutation rolls back.
begin;
do $$
declare v_user uuid; v_seen timestamptz; v_updated timestamptz; v_count integer;
begin
  select id,updated_at into v_user,v_updated from public.profiles where status='active'
    and id in(select user_id from public.user_roles where role='Viewer') limit 1;
  if v_user is null then raise exception 'Test requires an active Viewer'; end if;
  v_seen:=public.record_profile_app_load(v_user,'clm-regression-repeat');
  perform public.record_profile_app_load(v_user,'clm-regression-repeat');
  if (select count(*) from public.profile_access_loads where user_id=v_user and load_id='clm-regression-repeat')<>1
    or (select last_seen_at from public.profiles where id=v_user)<>v_seen then
    raise exception 'Duplicate load updated activity twice';
  end if;
  if (select updated_at from public.profiles where id=v_user)<>v_updated then raise exception 'Presence changed profile edit time'; end if;
  select count(*) into v_count from public.tasks;
  perform public.set_profile_access_status(v_user,'locked');
  if (select count(*) from public.tasks)<>v_count then raise exception 'Deactivation removed tasks'; end if;
  begin
    perform public.record_profile_app_load(v_user,'clm-regression-locked');
    raise exception 'Locked account recorded activity';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('authenticated','public.record_profile_app_load(uuid,text)','execute') then raise exception 'Unprivileged activity RPC access'; end if;
  if has_function_privilege('authenticated','public.set_profile_access_status(uuid,text)','execute') then raise exception 'Unprivileged deactivation RPC access'; end if;
  if has_table_privilege('authenticated','public.profile_access_loads','select') then raise exception 'Exposed access history'; end if;
end $$;
-- Use the currently active Admin within a transaction to test last-admin protection.
do $$ declare v_id uuid; begin
  for v_id in select p.id from public.profiles p join public.user_roles r on r.user_id=p.id where p.status='active' and r.role='Admin' loop
    begin perform public.set_profile_access_status(v_id,'locked');
    exception when check_violation then continue; end;
  end loop;
  if not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id where p.status='active' and r.role='Admin') then raise exception 'Disabled the last active administrator'; end if;
end $$;
rollback;
select 'account access regression passed (all changes rolled back)' as result;
