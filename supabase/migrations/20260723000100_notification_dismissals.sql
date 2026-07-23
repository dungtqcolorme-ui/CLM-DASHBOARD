create table if not exists public.notification_dismissals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_key text not null check (length(trim(notification_key)) between 1 and 160),
  created_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create index if not exists notification_dismissals_created_idx
  on public.notification_dismissals(user_id, created_at desc);

alter table public.notification_dismissals enable row level security;

revoke all on table public.notification_dismissals from anon;
revoke insert, update, delete on table public.notification_dismissals from authenticated;
grant select on table public.notification_dismissals to authenticated;
grant all on table public.notification_dismissals to service_role;

drop policy if exists "users_read_own_notification_dismissals"
  on public.notification_dismissals;
create policy "users_read_own_notification_dismissals"
  on public.notification_dismissals
  for select
  to authenticated
  using (user_id = auth.uid());
