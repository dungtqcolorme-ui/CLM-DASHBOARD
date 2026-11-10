begin;

create table marketing_private.codex_relay (
  singleton boolean primary key default true check (singleton),
  thread_id uuid not null,
  token_digest bytea not null check (octet_length(token_digest) = 32)
);
alter table marketing_private.codex_relay enable row level security;
revoke all on table marketing_private.codex_relay from public, anon, authenticated, service_role;

create table marketing_private.codex_jobs (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'queued' check (state in ('queued', 'running', 'completed', 'failed')),
  prompt text check (char_length(prompt) between 1 and 1200),
  answer text check (char_length(answer) between 1 and 10000),
  lease uuid,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '8 minutes'
);
alter table marketing_private.codex_jobs enable row level security;
revoke all on table marketing_private.codex_jobs from public, anon, authenticated, service_role;
create unique index codex_jobs_one_per_owner
  on marketing_private.codex_jobs (owner_id) where state in ('queued', 'running');
create unique index codex_jobs_one_running
  on marketing_private.codex_jobs ((true)) where state = 'running';
create index codex_jobs_expiry on marketing_private.codex_jobs (expires_at);

create index codex_jobs_owner_created on marketing_private.codex_jobs (owner_id, created_at);

create function public.marketing_codex_user_job(
  p_action text, p_id uuid default null, p_prompt text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := marketing_private.require_budget_actor(false);
  job marketing_private.codex_jobs%rowtype;
  now_at timestamptz := clock_timestamp();
  configured boolean := exists (select 1 from marketing_private.codex_relay);
begin
  if p_action = 'availability' then
    return jsonb_build_object('available', configured);
  end if;
  if p_id is null then
    raise exception 'Question ID required' using errcode = '22023';
  end if;

  if p_action = 'status' then
    select * into job from marketing_private.codex_jobs
    where id = p_id and owner_id = actor and expires_at > now_at - interval '24 hours';
    if not found then return null; end if;
    if job.state in ('queued', 'running') and job.expires_at <= now_at then
      return jsonb_build_object('id', job.id, 'state', 'failed');
    end if;
    return jsonb_build_object('id', job.id, 'state', job.state, 'answer', job.answer);
  end if;

  if p_action = 'enqueue' then
    if not configured then
      raise exception 'Bridge not configured' using errcode = 'P0503';
    end if;
    if p_prompt is null or char_length(btrim(p_prompt)) not between 1 and 1200
      or char_length(p_prompt) > 1200 then
      raise exception 'Invalid question' using errcode = '22023';
    end if;

    -- Both owners and relay workers acquire the same short-lived queue lock.
    perform pg_advisory_xact_lock(71539);
    select * into job from marketing_private.codex_jobs where id = p_id and owner_id = actor;
    if found then return jsonb_build_object('id', job.id, 'state', job.state); end if;
    delete from marketing_private.codex_jobs where expires_at <= now_at - interval '24 hours';
    update marketing_private.codex_jobs set state = 'failed', prompt = null, lease = null
    where state in ('queued', 'running') and expires_at <= now_at;
    if (select count(*) from marketing_private.codex_jobs where state in ('queued', 'running')) >= 8 then
      raise exception 'Queue full' using errcode = 'P0429';
    end if;
    if (select count(*) from marketing_private.codex_jobs
        where owner_id = actor and created_at > now_at - interval '1 minute') >= 3 then
      raise exception 'User queue budget exceeded' using errcode = 'P0429';
    end if;
    insert into marketing_private.codex_jobs (id, owner_id, prompt) values (p_id, actor, btrim(p_prompt))
    returning * into job;
    return jsonb_build_object('id', job.id, 'state', job.state);
  end if;

  raise exception 'Unknown question action' using errcode = '22023';
end;
$$;
revoke all on function public.marketing_codex_user_job(text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.marketing_codex_user_job(text, uuid, text) to authenticated;

create function public.marketing_codex_relay_job(
  p_action text, p_token text, p_thread uuid, p_id uuid default null,
  p_lease uuid default null, p_answer text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job marketing_private.codex_jobs%rowtype;
  now_at timestamptz := clock_timestamp();
begin
  if current_setting('role', true) is distinct from 'anon' or p_token is null or p_token !~ '^[0-9a-f]{64}$'
    or not exists (
      select 1 from marketing_private.codex_relay
      where thread_id = p_thread and token_digest = sha256(convert_to(p_token, 'UTF8'))
    ) then
    raise exception 'Bridge unauthorized' using errcode = '42501';
  end if;

  if p_action = 'claim' then
    perform pg_advisory_xact_lock(71539);
    delete from marketing_private.codex_jobs where expires_at <= now_at - interval '24 hours';
    update marketing_private.codex_jobs set state = 'failed', prompt = null, lease = null
    where state in ('queued', 'running') and expires_at <= now_at;
    if exists (select 1 from marketing_private.codex_jobs where state = 'running') then
      return null;
    end if;

    update marketing_private.codex_jobs as queued
    set state = 'running', lease = gen_random_uuid(), expires_at = now_at + interval '3 minutes'
    where queued.id = (
      select candidate.id from marketing_private.codex_jobs candidate
      where candidate.state = 'queued' and candidate.expires_at > now_at and exists (
        select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
        where p.id = candidate.owner_id and p.status = 'active'
          and r.role in ('Admin', 'PR Leader', 'PR Representative', 'Viewer')
      )
      order by candidate.created_at, candidate.id limit 1
    )
    returning * into job;
    if not found then return null; end if;
    return jsonb_build_object('id', job.id, 'lease', job.lease, 'prompt', job.prompt, 'threadId', p_thread);
  end if;

  if p_action = 'complete' then
    if p_answer is not null and (char_length(btrim(p_answer)) not between 1 and 10000 or char_length(p_answer) > 10000) then
      raise exception 'Invalid answer' using errcode = '22023';
    end if;
    update marketing_private.codex_jobs
    set state = case when p_answer is null then 'failed' else 'completed' end,
      answer = p_answer, prompt = null, lease = null, expires_at = now_at
    where id = p_id and state = 'running' and lease = p_lease and expires_at > now_at;
    return jsonb_build_object('accepted', found);
  end if;

  raise exception 'Unknown bridge action' using errcode = '22023';
end;
$$;
revoke all on function public.marketing_codex_relay_job(text, text, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.marketing_codex_relay_job(text, text, uuid, uuid, uuid, text) to anon;

create or replace function public.marketing_readiness_probe()
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'authenticated' or not exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
    where p.id = auth.uid() and p.status = 'active' and r.role = 'Admin'
  ) then
    raise exception 'Active Admin required' using errcode = '42501';
  end if;
  return '20261110000100';
end;
$$;

commit;
