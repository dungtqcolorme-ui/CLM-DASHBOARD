create table if not exists public.email_connections (
  id text primary key default 'primary' check (id = 'primary'),
  provider text not null default 'gmail' check (provider = 'gmail'),
  purpose text not null default 'system' check (purpose = 'system'),
  connected_by uuid references public.profiles(id) on delete set null,
  account_email text not null default '',
  refresh_token_ciphertext text not null default '',
  scopes text[] not null default '{}'::text[],
  status text not null default 'revoked' check (status in ('connected', 'expired', 'revoked')),
  last_error text not null default '',
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.email_connections (
  id,
  provider,
  purpose,
  account_email,
  refresh_token_ciphertext,
  scopes,
  status,
  created_at,
  updated_at
)
select
  integration.id,
  'gmail',
  'system',
  integration.google_account_email,
  integration.refresh_token_ciphertext,
  coalesce(
    array(select jsonb_array_elements_text(integration.scopes)),
    '{}'::text[]
  ),
  case when integration.refresh_token_ciphertext <> '' then 'connected' else 'revoked' end,
  integration.created_at,
  integration.updated_at
from public.google_calendar_integrations integration
on conflict (id) do nothing;

create table if not exists public.system_settings (
  id text primary key default 'email' check (id = 'email'),
  meeting_reminders_enabled boolean not null default false,
  meeting_reminder_minutes integer not null default 15
    check (meeting_reminder_minutes between 1 and 60),
  daily_report_enabled boolean not null default false,
  daily_report_time time without time zone,
  timezone text not null default 'Asia/Ho_Chi_Minh'
    check (length(trim(timezone)) between 1 and 100),
  daily_report_recipients jsonb not null default '[]'::jsonb
    check (jsonb_typeof(daily_report_recipients) = 'array'),
  max_retry_count integer not null default 3 check (max_retry_count between 0 and 10),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.system_settings (id)
values ('email')
on conflict (id) do nothing;

create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('meeting_reminder', 'daily_report')),
  reference_id text not null default '',
  occurrence_start timestamptz,
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  recipient_name text not null default '',
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  idempotency_key text not null unique,
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 3 check (max_retries between 0 and 10),
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text not null default '',
  error_message text not null default '',
  provider_message_id text not null default '',
  sent_at timestamptz,
  skipped_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  is_manual boolean not null default false,
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(recipient_email)) between 3 and 320)
);

create table if not exists public.email_job_attempts (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.email_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('processing', 'sent', 'failed', 'skipped')),
  error_message text not null default '',
  provider_message_id text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists email_jobs_due_idx
  on public.email_jobs(next_attempt_at, scheduled_for, created_at)
  where status in ('pending', 'failed');
create index if not exists email_jobs_reference_idx
  on public.email_jobs(type, reference_id, status);
create index if not exists email_jobs_recipient_idx
  on public.email_jobs(recipient_id, created_at desc)
  where recipient_id is not null;
create index if not exists email_jobs_manual_rate_idx
  on public.email_jobs(requested_by, created_at desc)
  where is_manual;
create index if not exists email_connections_connected_by_idx
  on public.email_connections(connected_by)
  where connected_by is not null;
create index if not exists system_settings_updated_by_idx
  on public.system_settings(updated_by)
  where updated_by is not null;
create index if not exists email_jobs_requested_by_idx
  on public.email_jobs(requested_by)
  where requested_by is not null;
create index if not exists email_job_attempts_job_idx
  on public.email_job_attempts(job_id, attempt_number desc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create or replace function private.touch_email_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_connections_touch on public.email_connections;
create trigger email_connections_touch
before update on public.email_connections
for each row execute function private.touch_email_row();

drop trigger if exists system_settings_touch on public.system_settings;
create trigger system_settings_touch
before update on public.system_settings
for each row execute function private.touch_email_row();

drop trigger if exists email_jobs_touch on public.email_jobs;
create trigger email_jobs_touch
before update on public.email_jobs
for each row execute function private.touch_email_row();

create or replace function private.claim_email_jobs_internal(
  worker_id text,
  batch_size integer default 20
)
returns setof public.email_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.email_job_attempts attempt
  set status = 'failed',
      error_message = case
        when attempt.error_message = '' then 'Worker trước không hoàn tất; sẽ thử lại nếu còn lượt.'
        else left(attempt.error_message || ' Worker trước không hoàn tất; sẽ thử lại nếu còn lượt.', 2000)
      end,
      finished_at = now()
  where attempt.status = 'processing'
    and exists (
      select 1
      from public.email_jobs job
      where job.id = attempt.job_id
        and job.status = 'processing'
        and job.locked_at < now() - interval '10 minutes'
    );

  update public.email_jobs
  set status = 'failed',
      retry_count = retry_count + 1,
      locked_at = null,
      locked_by = '',
      next_attempt_at = case when retry_count + 1 <= max_retries then now() else null end,
      error_message = case
        when error_message = '' then 'Worker trước không hoàn tất; sẽ thử lại nếu còn lượt.'
        else left(error_message || ' Worker trước không hoàn tất; sẽ thử lại nếu còn lượt.', 2000)
      end
  where status = 'processing'
    and locked_at < now() - interval '10 minutes';

  return query
  with candidates as (
    select job.id
    from public.email_jobs job
    where job.status in ('pending', 'failed')
      and job.scheduled_for <= now()
      and (
        (job.status = 'pending' and coalesce(job.next_attempt_at, job.scheduled_for) <= now())
        or (job.status = 'failed' and job.next_attempt_at is not null and job.next_attempt_at <= now())
      )
      and job.retry_count <= job.max_retries
    order by coalesce(job.next_attempt_at, job.scheduled_for), job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 20), 100))
  ), claimed as (
    update public.email_jobs job
    set status = 'processing',
        locked_at = now(),
        locked_by = left(coalesce(worker_id, ''), 120),
        error_message = ''
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select * from claimed;
end;
$$;

create or replace function public.claim_email_jobs(
  worker_id text,
  batch_size integer default 20
)
returns setof public.email_jobs
language sql
security invoker
set search_path = ''
as $$
  select * from private.claim_email_jobs_internal(worker_id, batch_size);
$$;

alter table public.email_connections enable row level security;
alter table public.system_settings enable row level security;
alter table public.email_jobs enable row level security;
alter table public.email_job_attempts enable row level security;

revoke all on table public.email_connections, public.system_settings, public.email_jobs, public.email_job_attempts from anon, authenticated;
grant all on table public.email_connections, public.system_settings, public.email_jobs, public.email_job_attempts to service_role;
grant usage, select on sequence public.email_job_attempts_id_seq to service_role;

revoke all on function private.claim_email_jobs_internal(text, integer) from public, anon, authenticated;
grant execute on function private.claim_email_jobs_internal(text, integer) to service_role;
revoke all on function private.touch_email_row() from public, anon, authenticated;
grant execute on function private.touch_email_row() to service_role;
revoke all on function public.claim_email_jobs(text, integer) from public, anon, authenticated;
grant execute on function public.claim_email_jobs(text, integer) to service_role;

comment on table public.email_connections is
  'Server-only Google system connection. Refresh tokens are encrypted by the application before storage.';
comment on table public.email_jobs is
  'Idempotent backend queue for Gmail meeting reminders and daily reports.';
comment on column public.email_jobs.idempotency_key is
  'Unique application-level key preventing duplicate automatic sends.';
comment on table public.system_settings is
  'Server-only email scheduler settings. Sending is disabled by default until an administrator configures it.';
