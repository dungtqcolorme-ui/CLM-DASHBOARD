create table if not exists public.email_manual_rate_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists email_manual_rate_events_actor_idx
  on public.email_manual_rate_events(actor_id, created_at desc);

alter table public.email_manual_rate_events enable row level security;
revoke all on table public.email_manual_rate_events from anon, authenticated;
grant all on table public.email_manual_rate_events to service_role;
grant usage, select on sequence public.email_manual_rate_events_id_seq to service_role;

drop policy if exists "server_only_email_manual_rate_events" on public.email_manual_rate_events;
create policy "server_only_email_manual_rate_events"
on public.email_manual_rate_events for all to anon, authenticated
using (false)
with check (false);

create or replace function public.consume_manual_email_rate_limit(actor_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(actor_id::text, 0));

  delete from public.email_manual_rate_events
  where created_at < now() - interval '1 day';

  if (
    select count(*)
    from public.email_manual_rate_events event
    where event.actor_id = consume_manual_email_rate_limit.actor_id
      and event.created_at >= now() - interval '10 minutes'
  ) >= 3 then
    raise exception 'Bạn đã gửi tối đa 3 email thủ công trong 10 phút. Vui lòng thử lại sau.'
      using errcode = 'P0001';
  end if;

  insert into public.email_manual_rate_events(actor_id)
  values (consume_manual_email_rate_limit.actor_id);
end;
$$;

revoke all on function public.consume_manual_email_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.consume_manual_email_rate_limit(uuid) to service_role;

drop index if exists public.email_jobs_manual_rate_idx;

comment on table public.email_manual_rate_events is
  'Server-only, transactionally consumed rate-limit slots for manual email actions.';
comment on function public.consume_manual_email_rate_limit(uuid) is
  'Atomically allows at most three manual email actions per manager in ten minutes.';
