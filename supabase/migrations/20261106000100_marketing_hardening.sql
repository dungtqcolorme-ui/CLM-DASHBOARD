begin;

-- Actor-scoped limits survive different API instances and direct Data API calls.
-- The same transaction rolls the counter back when a command is rejected.
create table marketing_private.command_budgets (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  minute_bucket bigint not null,
  budget text not null check (budget in ('mutation', 'report', 'render', 'export')),
  used integer not null check (used > 0),
  primary key (actor_id, minute_bucket, budget)
);
revoke all on table marketing_private.command_budgets from public, anon, authenticated, service_role;

create function marketing_private.take_budget(actor uuid, category text, ceiling integer)
returns void language plpgsql set search_path = '' as $$
declare
  bucket bigint := floor(extract(epoch from clock_timestamp()) / 60);
begin
  delete from marketing_private.command_budgets
    where actor_id = actor and minute_bucket < bucket - 1440;
  insert into marketing_private.command_budgets (actor_id, minute_bucket, budget, used)
  values (actor, bucket, category, 1)
  on conflict (actor_id, minute_bucket, budget) do update
  set used = command_budgets.used + 1
  where command_budgets.used < ceiling;
  if not found then
    raise exception 'Marketing operation budget exceeded' using errcode = 'P0429';
  end if;
end;
$$;

create function marketing_private.require_budget_actor(write_required boolean)
returns uuid language plpgsql set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if current_setting('role', true) is distinct from 'authenticated' or actor is null then
    raise exception 'Authenticated session required' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = actor and status = 'active' for share;
  if not found then
    raise exception 'Active account required' using errcode = '42501';
  end if;
  perform 1 from public.user_roles where user_id = actor order by role for share;
  if not exists (select 1 from public.user_roles where user_id = actor and (
    role in ('Admin', 'PR Leader', 'PR Representative') or (not write_required and role = 'Viewer')
  )) then
    raise exception 'Marketing role required' using errcode = '42501';
  end if;
  return actor;
end;
$$;

create function marketing_private.metered_command(module text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := marketing_private.require_budget_actor(true);
  action text := payload->>'action';
begin
  if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text) > 262144 then
    raise exception 'Invalid or oversized Marketing command' using errcode = '22023';
  end if;
  -- An authorized Emergency Hold must not wait for routine budget recovery.
  if module = 'report' and action = 'build_report' then
    perform marketing_private.take_budget(actor, 'report', 12);
  elsif module = 'video' and action = 'request_video_render' then
    perform marketing_private.take_budget(actor, 'render', 6);
  elsif module <> 'foundation' or action is distinct from 'emergency_hold' then
    perform marketing_private.take_budget(actor, 'mutation', 240);
  end if;

  case module
    when 'foundation' then return marketing_private.command(payload);
    when 'knowledge' then return marketing_private.knowledge_command(payload);
    when 'creative' then return marketing_private.creative_command(payload);
    when 'publishing' then return marketing_private.publishing_command(payload);
    when 'video' then return marketing_private.video_command(payload);
    when 'report' then return marketing_private.report_command(payload);
    else raise exception 'Unknown Marketing module' using errcode = '22023';
  end case;
end;
$$;

-- Preserve RPC signatures. Expose only the budgeted entry points and leave the
-- existing implementation functions responsible for scope, locks and transitions.
create or replace function public.marketing_command(p_command jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select marketing_private.metered_command('foundation', p_command); $$;
create or replace function public.marketing_knowledge_command(p_command jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select marketing_private.metered_command('knowledge', p_command); $$;
create or replace function public.marketing_creative_command(p_command jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select marketing_private.metered_command('creative', p_command); $$;
create or replace function public.marketing_publishing_command(p_command jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select marketing_private.metered_command('publishing', p_command); $$;
create or replace function public.marketing_video_command(p_command jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select marketing_private.metered_command('video', p_command); $$;
create or replace function public.marketing_report_command(p_command jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select marketing_private.metered_command('report', p_command); $$;

revoke execute on function marketing_private.command(jsonb), marketing_private.knowledge_command(jsonb),
  marketing_private.creative_command(jsonb), marketing_private.publishing_command(jsonb),
  marketing_private.video_command(jsonb), marketing_private.report_command(jsonb)
from public, anon, authenticated, service_role;
revoke all on function marketing_private.metered_command(text,jsonb), marketing_private.take_budget(uuid,text,integer),
  marketing_private.require_budget_actor(boolean) from public, anon, authenticated, service_role;
grant execute on function marketing_private.metered_command(text,jsonb) to authenticated;

create function public.marketing_reserve_report_export()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform marketing_private.take_budget(marketing_private.require_budget_actor(false), 'export', 10);
end;
$$;
revoke all on function public.marketing_reserve_report_export() from public, anon, authenticated, service_role;
grant execute on function public.marketing_reserve_report_export() to authenticated;

create function public.marketing_readiness_probe()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' or not exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
    where p.id = auth.uid() and p.status = 'active' and r.role = 'Admin'
  ) then
    raise exception 'Active Admin required' using errcode = '42501';
  end if;
  return '20261106000100';
end;
$$;
revoke all on function public.marketing_readiness_probe() from public, anon, authenticated, service_role;
grant execute on function public.marketing_readiness_probe() to authenticated;

commit;
