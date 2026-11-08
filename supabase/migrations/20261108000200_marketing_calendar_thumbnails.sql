begin;

alter table marketing_private.command_budgets drop constraint command_budgets_budget_check;
alter table marketing_private.command_budgets add constraint command_budgets_budget_check
  check(budget in ('mutation','report','render','export','thumbnail'));

create function public.marketing_reserve_calendar_thumbnail()
returns void language plpgsql security definer set search_path='' as $$
begin
  perform marketing_private.take_budget(marketing_private.require_budget_actor(false),'thumbnail',30);
end;
$$;
revoke all on function public.marketing_reserve_calendar_thumbnail() from public,anon,authenticated,service_role;
grant execute on function public.marketing_reserve_calendar_thumbnail() to authenticated;

create or replace function public.marketing_readiness_probe()
returns text language plpgsql stable security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'authenticated' or not exists(
    select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
    where p.id=auth.uid() and p.status='active' and r.role='Admin'
  ) then raise exception 'Active Admin required' using errcode='42501'; end if;
  return '20261108000200';
end;
$$;
commit;
