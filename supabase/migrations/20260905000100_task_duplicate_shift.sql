alter table public.tasks
  add column if not exists shift text,
  add column if not exists duplicated_from_task_id text not null default '',
  add column if not exists duplicate_root_task_id text not null default '',
  add column if not exists duplicated_by uuid references public.profiles(id);

alter table public.tasks drop constraint if exists tasks_shift_check;
alter table public.tasks
  add constraint tasks_shift_check
  check (shift is null or shift in ('morning', 'afternoon'));

-- Preserve all legacy rows. Only recognized historical values are promoted to
-- the canonical column; missing/unknown values intentionally remain unassigned.
update public.tasks
set shift = case
  when lower(trim(coalesce(nullif(raw_payload ->> 'shift', ''), raw_payload ->> 'taskShift', '')))
    in ('morning', 'sáng', 'ca sáng', 'buổi sáng') then 'morning'
  when lower(trim(coalesce(nullif(raw_payload ->> 'shift', ''), raw_payload ->> 'taskShift', '')))
    in ('afternoon', 'chiều', 'ca chiều', 'buổi chiều') then 'afternoon'
  else null
end
where shift is null;

create index if not exists tasks_owner_task_date_shift_active_idx
  on public.tasks(owner_id, task_date, shift)
  where deleted_at is null;

create index if not exists tasks_duplicate_root_active_idx
  on public.tasks(duplicate_root_task_id, created_at)
  where deleted_at is null and duplicate_root_task_id <> '';

create index if not exists tasks_duplicated_by_idx
  on public.tasks(duplicated_by, created_at desc)
  where duplicated_by is not null;

comment on column public.tasks.shift is
  'Daily-task work shift: morning, afternoon, or NULL for legacy/unassigned tasks.';
comment on column public.tasks.duplicated_from_task_id is
  'Immediate source task ID for an explicit Duplicate task action; separate from deadline rescheduling.';
comment on column public.tasks.duplicate_root_task_id is
  'Root source ID across explicit Duplicate task generations.';
comment on column public.tasks.duplicated_by is
  'Authenticated actor who performed the explicit Duplicate task action.';
