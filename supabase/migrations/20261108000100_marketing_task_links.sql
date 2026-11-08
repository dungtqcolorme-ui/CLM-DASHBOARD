begin;

-- A reference to the existing Task module. No trigger writes to tasks or content.
create table public.marketing_task_links (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.marketing_teams(id),
  campaign_id uuid not null references public.marketing_campaigns(id),
  content_id uuid not null references public.marketing_content_items(id),
  task_id text not null check (task_id ~ '^[A-Za-z0-9:_-]{1,120}$'),
  enabled boolean not null default true,
  creator_id uuid not null references public.profiles(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (content_id, task_id)
);
-- Keep historical references if a legacy task is permanently removed.
create index marketing_task_links_scope on public.marketing_task_links(team_id,content_id,enabled);
create table public.marketing_task_link_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.marketing_teams(id),
  link_id uuid not null references public.marketing_task_links(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('link_task','unlink_task')),
  reason text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.marketing_task_links enable row level security;
alter table public.marketing_task_link_events enable row level security;
revoke all on public.marketing_task_links, public.marketing_task_link_events from public, anon, authenticated, service_role;
grant select on public.marketing_task_links, public.marketing_task_link_events to authenticated;
create policy task_link_read on public.marketing_task_links for select to authenticated using (marketing_private.can_read(team_id));
create policy task_link_event_read on public.marketing_task_link_events for select to authenticated using (marketing_private.can_read(team_id));

create function marketing_private.task_link_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or tg_table_name='marketing_task_link_events' then
    raise exception 'Task link history is immutable' using errcode='42501';
  end if;
  if (new.id,new.team_id,new.campaign_id,new.content_id,new.task_id,new.creator_id,new.created_at)
    is distinct from (old.id,old.team_id,old.campaign_id,old.content_id,old.task_id,old.creator_id,old.created_at)
    or new.version<>old.version+1 or new.enabled=old.enabled then
    raise exception 'Invalid Task link update' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger task_link_guard before update or delete on public.marketing_task_links
  for each row execute function marketing_private.task_link_guard();
create trigger task_link_event_guard before update or delete on public.marketing_task_link_events
  for each row execute function marketing_private.task_link_guard();

create function marketing_private.task_command(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=marketing_private.require_budget_actor(true);
  action text:=payload->>'action';
  keys text[];
  content public.marketing_content_items%rowtype;
  link public.marketing_task_links%rowtype;
  expected numeric;
  reason text:='';
  campaign_status text;
begin
  keys:=case action
    when 'link_task' then array['action','content_id','task_id','expected_link_version']
    when 'unlink_task' then array['action','id','expected_version','reason']
  end;
  if keys is null or jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>262144
    or not (payload ?& keys) or exists(select 1 from jsonb_object_keys(payload) k where not(k=any(keys))) then
    raise exception 'Invalid Task link command' using errcode='22023';
  end if;
  if action='link_task' then
    if not coalesce(marketing_private.creative_uuid(payload->'content_id'),false)
      or jsonb_typeof(payload->'task_id') is distinct from 'string' or payload->>'task_id' !~ '^[A-Za-z0-9:_-]{1,120}$'
      or jsonb_typeof(payload->'expected_link_version') is distinct from 'number' then
      raise exception 'Invalid Task reference' using errcode='22023';
    end if;
    expected:=(payload->>'expected_link_version')::numeric;
    select * into content from public.marketing_content_items where id=(payload->>'content_id')::uuid;
  else
    if not coalesce(marketing_private.creative_uuid(payload->'id'),false)
      or jsonb_typeof(payload->'expected_version') is distinct from 'number'
      or jsonb_typeof(payload->'reason') is distinct from 'string'
      or not marketing_private.knowledge_text(payload->>'reason',2000,true) then
      raise exception 'Invalid removal fields' using errcode='22023';
    end if;
    expected:=(payload->>'expected_version')::numeric;
    reason:=marketing_private.trim_text(payload->>'reason');
    select * into link from public.marketing_task_links where id=(payload->>'id')::uuid;
    select * into content from public.marketing_content_items where id=link.content_id;
  end if;
  if expected<0 or expected>2147483646 or expected<>trunc(expected) or (action='unlink_task' and expected<1) then
    raise exception 'Invalid Task link version' using errcode='22023';
  end if;
  if content.id is null or not marketing_private.can_read(content.team_id) then
    raise exception 'Content unavailable' using errcode='42501';
  end if;
  perform marketing_private.take_budget(actor,'mutation',240);

  -- Match the Campaign -> content lock order used by the Foundation commands.
  select status into campaign_status from public.marketing_campaigns where id=content.campaign_id for share;
  if campaign_status='archived' then raise exception 'Campaign archived' using errcode='22023'; end if;
  perform 1 from public.marketing_content_items where id=content.id for update;
  if not exists(select 1 from public.user_roles where user_id=actor and role='Admin') then
    perform 1 from public.marketing_team_memberships where team_id=content.team_id and user_id=actor for share;
    if not found then raise exception 'Team membership required' using errcode='42501'; end if;
  end if;
  if action='link_task' then
    perform 1 from public.tasks where id=payload->>'task_id' and deleted_at is null for share;
    if not found then raise exception 'Task unavailable' using errcode='22023'; end if;
    select * into link from public.marketing_task_links where content_id=content.id and task_id=payload->>'task_id' for update;
    if link.id is not null and link.enabled and (expected=0 or expected=link.version) then return to_jsonb(link); end if;
    if coalesce(link.version,0)<>expected then raise exception 'Task link conflict' using errcode='40001'; end if;
    if (select count(*) from public.marketing_task_links where content_id=content.id and enabled)>=20 then
      raise exception 'Content has reached its Task link limit' using errcode='22023';
    end if;
    if link.id is null then
      insert into public.marketing_task_links(team_id,campaign_id,content_id,task_id,creator_id)
        values(content.team_id,content.campaign_id,content.id,payload->>'task_id',actor) returning * into link;
    else
      update public.marketing_task_links set enabled=true,version=version+1,updated_at=clock_timestamp()
        where id=link.id returning * into link;
    end if;
  else
    select * into link from public.marketing_task_links where id=link.id for update;
    if link.version<>expected then raise exception 'Task link conflict' using errcode='40001'; end if;
    if not link.enabled then return to_jsonb(link); end if;
    update public.marketing_task_links set enabled=false,version=version+1,updated_at=clock_timestamp()
      where id=link.id returning * into link;
  end if;
  insert into public.marketing_task_link_events(team_id,link_id,actor_id,action,reason,snapshot)
    values(content.team_id,link.id,actor,action,reason,to_jsonb(link));
  return to_jsonb(link);
end;
$$;
create function public.marketing_task_command(p_command jsonb) returns jsonb
language sql security invoker set search_path='' as $$select marketing_private.task_command(p_command);$$;
revoke all on function marketing_private.task_link_guard(), marketing_private.task_command(jsonb), public.marketing_task_command(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function marketing_private.task_command(jsonb), public.marketing_task_command(jsonb) to authenticated;

create or replace function public.marketing_readiness_probe() returns text
language plpgsql stable security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'authenticated' or not exists(
    select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
    where p.id=auth.uid() and p.status='active' and r.role='Admin'
  ) then raise exception 'Active Admin required' using errcode='42501'; end if;
  return '20261108000100';
end;
$$;
commit;
