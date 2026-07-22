create or replace function public.can_write_operational_data()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_active() and exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('Admin', 'PR Leader', 'PR Representative')
  );
$$;

grant execute on function public.can_write_operational_data() to authenticated;

create table if not exists public.tasks (
  id text primary key,
  title text not null check (length(trim(title)) between 1 and 240),
  description text not null default '',
  kind text not null default 'personal' check (kind in ('personal', 'coordination')),
  owner_id uuid not null references public.profiles(id),
  deadline date not null,
  proof_url text not null default '',
  status text not null default 'Mới tạo' check (status in ('Mới tạo', 'Đang thực hiện', 'Chờ review', 'Cần chỉnh sửa', 'Hoàn thành')),
  related_meeting_id text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  raw_payload jsonb not null default '{}'::jsonb
);

create table if not exists public.task_collaborators (
  task_id text not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table if not exists public.meetings (
  id text primary key,
  title text not null check (length(trim(title)) between 1 and 240),
  starts_at timestamptz not null,
  ends_at timestamptz,
  notes text not null default '',
  action_items text not null default '',
  meeting_link text not null default '',
  related_task_id text not null default '',
  status text not null default 'Sắp diễn ra' check (status in ('Sắp diễn ra', 'Đã hủy')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  raw_payload jsonb not null default '{}'::jsonb,
  check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.meeting_participants (
  meeting_id text not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

create table if not exists public.work_comments (
  id uuid primary key default gen_random_uuid(),
  item_kind text not null check (item_kind in ('task', 'meeting')),
  item_id text not null,
  author_id uuid not null references public.profiles(id),
  author_name text not null default '',
  body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (length(trim(body)) > 0 or jsonb_array_length(attachments) > 0)
);

create table if not exists public.work_history (
  id bigint generated always as identity primary key,
  item_kind text not null check (item_kind in ('task', 'meeting')),
  item_id text not null,
  actor_id uuid references public.profiles(id),
  action text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  event_key text not null,
  title text not null default 'Thông báo',
  body text not null,
  type text not null default 'info',
  item_kind text not null default '',
  item_id text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key)
);

create index if not exists tasks_owner_deadline_idx on public.tasks(owner_id, deadline);
create index if not exists tasks_status_idx on public.tasks(status);
create index if not exists task_collaborators_user_idx on public.task_collaborators(user_id, task_id);
create index if not exists meetings_start_idx on public.meetings(starts_at);
create index if not exists meeting_participants_user_idx on public.meeting_participants(user_id, meeting_id);
create index if not exists work_comments_item_idx on public.work_comments(item_kind, item_id, created_at);
create index if not exists work_history_item_idx on public.work_history(item_kind, item_id, created_at);
create index if not exists user_notifications_recipient_idx on public.user_notifications(recipient_id, read_at, created_at desc);

create or replace function public.touch_work_item()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;

drop trigger if exists tasks_touch_work_item on public.tasks;
create trigger tasks_touch_work_item
before update on public.tasks
for each row execute function public.touch_work_item();

drop trigger if exists meetings_touch_work_item on public.meetings;
create trigger meetings_touch_work_item
before update on public.meetings
for each row execute function public.touch_work_item();

alter table public.tasks enable row level security;
alter table public.task_collaborators enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.work_comments enable row level security;
alter table public.work_history enable row level security;
alter table public.user_notifications enable row level security;

revoke all on table public.tasks, public.task_collaborators, public.meetings, public.meeting_participants, public.work_comments, public.work_history, public.user_notifications from anon;
revoke insert, update, delete on table public.tasks, public.task_collaborators, public.meetings, public.meeting_participants, public.work_comments, public.work_history, public.user_notifications from authenticated;
grant select on table public.tasks, public.task_collaborators, public.meetings, public.meeting_participants, public.work_comments, public.work_history to authenticated;
grant select on table public.user_notifications to authenticated;
grant all on table public.tasks, public.task_collaborators, public.meetings, public.meeting_participants, public.work_comments, public.work_history, public.user_notifications to service_role;

create policy "active_users_read_tasks" on public.tasks for select to authenticated using (public.current_user_active());
create policy "active_users_read_task_collaborators" on public.task_collaborators for select to authenticated using (public.current_user_active());
create policy "active_users_read_meetings" on public.meetings for select to authenticated using (public.current_user_active());
create policy "active_users_read_meeting_participants" on public.meeting_participants for select to authenticated using (public.current_user_active());
create policy "active_users_read_work_comments" on public.work_comments for select to authenticated using (public.current_user_active());
create policy "active_users_read_work_history" on public.work_history for select to authenticated using (public.current_user_active());
create policy "users_read_own_notifications" on public.user_notifications for select to authenticated using (recipient_id = auth.uid());

drop policy if exists "active_users_insert_dashboard_state" on storage.objects;
drop policy if exists "active_users_update_dashboard_state" on storage.objects;
drop policy if exists "active_users_delete_dashboard_state" on storage.objects;
create policy "operational_users_insert_dashboard_state" on storage.objects for insert to authenticated
with check (bucket_id = 'clm-dashboard-state' and public.can_write_operational_data());
create policy "operational_users_update_dashboard_state" on storage.objects for update to authenticated
using (bucket_id = 'clm-dashboard-state' and public.can_write_operational_data())
with check (bucket_id = 'clm-dashboard-state' and public.can_write_operational_data());
create policy "operational_users_delete_dashboard_state" on storage.objects for delete to authenticated
using (bucket_id = 'clm-dashboard-state' and public.can_write_operational_data());

drop policy if exists "active_users_read_own_uploads" on storage.objects;
create policy "active_users_read_team_uploads" on storage.objects for select to authenticated
using (bucket_id = 'clm-dashboard-uploads' and public.current_user_active());

drop policy if exists "active_users_insert_state_meta" on public.dashboard_state_meta;
drop policy if exists "active_users_update_state_meta" on public.dashboard_state_meta;
create policy "operational_users_insert_state_meta" on public.dashboard_state_meta for insert to authenticated
with check (public.can_write_operational_data());
create policy "operational_users_update_state_meta" on public.dashboard_state_meta for update to authenticated
using (public.can_write_operational_data())
with check (public.can_write_operational_data());
