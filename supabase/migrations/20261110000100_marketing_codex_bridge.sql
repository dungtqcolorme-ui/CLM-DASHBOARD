begin;

create table marketing_private.codex_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  state text not null default 'queued' check (state in ('queued', 'running', 'completed', 'failed')),
  prompt text check (char_length(prompt) between 1 and 1200),
  answer text check (char_length(answer) between 1 and 10000),
  lease uuid,
  expires_at timestamptz not null default clock_timestamp() + interval '2 minutes'
);
alter table marketing_private.codex_jobs enable row level security;
revoke all on table marketing_private.codex_jobs from public, anon, authenticated, service_role;
create unique index codex_jobs_one_active
  on marketing_private.codex_jobs (owner_id) where state in ('queued', 'running');

create index codex_jobs_expiry on marketing_private.codex_jobs (expires_at);

create function public.marketing_codex_job(
  p_action text, p_owner uuid, p_id uuid default null, p_prompt text default null,
  p_lease uuid default null, p_answer text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  job marketing_private.codex_jobs%rowtype;
  now_at timestamptz := clock_timestamp();
begin
  if current_setting('role', true) is distinct from 'service_role' or p_owner is null then
    raise exception 'Bridge service required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
    where p.id = p_owner and p.status = 'active' and r.role = 'Admin'
  ) then
    raise exception 'Active Admin required' using errcode = '42501';
  end if;

  if p_action = 'status' then
    select * into job from marketing_private.codex_jobs
    where id = p_id and owner_id = p_owner and expires_at > now_at - interval '24 hours';
    if not found then return null; end if;
    if job.state in ('queued', 'running') and job.expires_at <= now_at then
      return jsonb_build_object('id', job.id, 'state', 'failed');
    end if;
    return jsonb_build_object('id', job.id, 'state', job.state, 'answer', job.answer);
  end if;

  if p_action = 'enqueue' then
    if p_id is null or p_prompt is null or char_length(p_prompt) not between 1 and 1200 then
      raise exception 'Invalid question' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 71539));
    select * into job from marketing_private.codex_jobs where id = p_id and owner_id = p_owner;
    if found then return jsonb_build_object('id', job.id, 'state', job.state); end if;
    delete from marketing_private.codex_jobs where expires_at <= now_at - interval '24 hours';
    update marketing_private.codex_jobs set state = 'failed', prompt = null, lease = null
    where owner_id = p_owner and state in ('queued', 'running') and expires_at <= now_at;
    insert into marketing_private.codex_jobs (id, owner_id, prompt) values (p_id, p_owner, p_prompt)
    returning * into job;
    return jsonb_build_object('id', job.id, 'state', job.state);
  end if;

  if p_action = 'claim' then
    delete from marketing_private.codex_jobs where expires_at <= now_at - interval '24 hours';
    update marketing_private.codex_jobs set state = 'failed', prompt = null, lease = null
    where owner_id = p_owner and state in ('queued', 'running') and expires_at <= now_at;
    update marketing_private.codex_jobs
    set state = 'running', lease = gen_random_uuid(), expires_at = now_at + interval '3 minutes'
    where owner_id = p_owner and state = 'queued' and expires_at > now_at
    returning * into job;
    if not found then return null; end if;
    return jsonb_build_object('id', job.id, 'lease', job.lease, 'prompt', job.prompt);
  end if;

  if p_action = 'complete' then
    update marketing_private.codex_jobs
    set state = case when p_answer is null then 'failed' else 'completed' end,
      answer = p_answer, prompt = null, lease = null, expires_at = now_at
    where owner_id = p_owner and id = p_id and state = 'running'
      and lease = p_lease and expires_at > now_at;
    return jsonb_build_object('accepted', found);
  end if;

  raise exception 'Unknown bridge action' using errcode = '22023';
end;
$$;
revoke all on function public.marketing_codex_job(text, uuid, uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.marketing_codex_job(text, uuid, uuid, text, uuid, text)
  to service_role;

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
