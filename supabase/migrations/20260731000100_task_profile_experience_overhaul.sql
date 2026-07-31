create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists phone text not null default '',
  add column if not exists avatar_path text not null default '';

alter table public.tasks
  add column if not exists completion_confirmed boolean not null default false,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.profiles(id),
  add column if not exists original_task_id text not null default '',
  add column if not exists rescheduled_from_task_id text not null default '',
  add column if not exists rescheduled_to_task_id text not null default '',
  add column if not exists reschedule_reason text not null default '',
  add column if not exists last_move_mode text not null default '',
  add column if not exists last_move_reason text not null default '',
  add column if not exists last_moved_at timestamptz,
  add column if not exists last_moved_by uuid references public.profiles(id);

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks
  add constraint tasks_status_check
  check (status in ('Mới tạo', 'Đang thực hiện', 'Chờ review', 'Cần chỉnh sửa', 'Hoàn thành', 'Đã lùi hạn'));

alter table public.tasks drop constraint if exists tasks_last_move_mode_check;
alter table public.tasks
  add constraint tasks_last_move_mode_check
  check (last_move_mode in ('', 'move', 'copy'));

alter table public.meetings
  add column if not exists meeting_type text not null default 'google_meet',
  add column if not exists location text not null default '',
  add column if not exists recurrence_type text not null default 'none',
  add column if not exists recurrence_parent_id text not null default '',
  add column if not exists recurrence_until date;

alter table public.meetings drop constraint if exists meetings_meeting_type_check;
alter table public.meetings
  add constraint meetings_meeting_type_check
  check (meeting_type in ('google_meet', 'in_person'));

alter table public.meetings drop constraint if exists meetings_recurrence_type_check;
alter table public.meetings
  add constraint meetings_recurrence_type_check
  check (recurrence_type in ('none', 'weekly', 'monthly'));

alter table public.work_history
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists profiles_date_of_birth_idx
  on public.profiles(date_of_birth)
  where date_of_birth is not null;
create index if not exists tasks_created_by_deadline_idx
  on public.tasks(created_by, deadline);
create index if not exists tasks_original_task_idx
  on public.tasks(original_task_id)
  where original_task_id <> '';
create index if not exists meetings_recurrence_parent_idx
  on public.meetings(recurrence_parent_id)
  where recurrence_parent_id <> '';

create or replace function public.can_manage_owned_work_item(item_creator uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active()
    and (
      item_creator = auth.uid()
      or public.has_app_role('Admin')
      or public.has_app_role('PR Leader')
    );
$$;

grant execute on function public.can_manage_owned_work_item(uuid) to authenticated;

drop policy if exists "task_creator_or_manager_updates" on public.tasks;
create policy "task_creator_or_manager_updates"
on public.tasks for update to authenticated
using (public.can_manage_owned_work_item(created_by))
with check (public.can_manage_owned_work_item(created_by));

drop policy if exists "task_creator_or_manager_deletes" on public.tasks;
create policy "task_creator_or_manager_deletes"
on public.tasks for delete to authenticated
using (public.can_manage_owned_work_item(created_by));

drop policy if exists "meeting_creator_or_manager_updates" on public.meetings;
create policy "meeting_creator_or_manager_updates"
on public.meetings for update to authenticated
using (public.can_manage_owned_work_item(created_by))
with check (public.can_manage_owned_work_item(created_by));

drop policy if exists "meeting_creator_or_manager_deletes" on public.meetings;
create policy "meeting_creator_or_manager_deletes"
on public.meetings for delete to authenticated
using (public.can_manage_owned_work_item(created_by));

revoke insert, update, delete on table public.tasks, public.meetings from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clm-profile-avatars',
  'clm-profile-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "active_users_read_profile_avatars" on storage.objects;
create policy "active_users_read_profile_avatars"
on storage.objects for select to authenticated
using (bucket_id = 'clm-profile-avatars' and public.current_user_active());

drop policy if exists "users_insert_own_profile_avatar" on storage.objects;
create policy "users_insert_own_profile_avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'clm-profile-avatars'
  and public.current_user_active()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users_update_own_profile_avatar" on storage.objects;
create policy "users_update_own_profile_avatar"
on storage.objects for update to authenticated
using (
  bucket_id = 'clm-profile-avatars'
  and public.current_user_active()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'clm-profile-avatars'
  and public.current_user_active()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "users_delete_own_profile_avatar" on storage.objects;
create policy "users_delete_own_profile_avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'clm-profile-avatars'
  and public.current_user_active()
  and (storage.foldername(name))[1] = auth.uid()::text
);

grant select on table public.profiles, public.tasks, public.meetings, public.work_history to authenticated;
grant all on table public.profiles, public.tasks, public.meetings, public.work_history to service_role;

comment on column public.tasks.original_task_id is
  'Root task ID retained across copy and deadline-delay operations.';
comment on column public.tasks.rescheduled_from_task_id is
  'Immediate source task ID when this task was created by delaying a deadline.';
comment on column public.tasks.rescheduled_to_task_id is
  'Replacement task ID when this task was superseded by a deadline delay.';
comment on column public.work_history.metadata is
  'Structured audit context such as old/new dates, reason, copy/move mode, and source IDs.';
