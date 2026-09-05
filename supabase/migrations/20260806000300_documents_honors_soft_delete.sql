create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 300),
  url text,
  storage_path text,
  document_type text not null check (document_type in ('link', 'file')),
  main_category text not null default 'Chưa phân loại'
    check (length(trim(main_category)) between 1 and 200),
  sub_category text not null default 'Chưa phân loại'
    check (length(trim(sub_category)) between 1 and 200),
  sort_order integer not null default 0 check (sort_order between -10000 and 10000),
  is_active boolean not null default true,
  keywords text[] not null default '{}'::text[],
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_metadata jsonb not null default '{}'::jsonb,
  constraint documents_source_check check (
    (document_type = 'link' and url is not null and storage_path is null)
    or
    (document_type = 'file' and storage_path is not null and url is null)
  )
);

drop trigger if exists documents_touch_updated_at on public.documents;
create trigger documents_touch_updated_at
before update on public.documents
for each row execute function public.touch_updated_at();

create unique index if not exists documents_url_unique_idx
  on public.documents(url)
  where url is not null;
create unique index if not exists documents_storage_path_unique_idx
  on public.documents(storage_path)
  where storage_path is not null;
create index if not exists documents_active_group_order_idx
  on public.documents(main_category, sub_category, sort_order, name)
  where is_active;
create index if not exists documents_created_by_idx
  on public.documents(created_by);
create index if not exists documents_keywords_gin_idx
  on public.documents using gin(keywords);

alter table public.documents enable row level security;
revoke all on table public.documents from anon, authenticated;
grant select on table public.documents to authenticated;
grant all on table public.documents to service_role;

drop policy if exists "active_users_read_active_documents" on public.documents;
create policy "active_users_read_active_documents"
on public.documents for select to authenticated
using (public.current_user_active() and is_active);

create table if not exists public.staff_aliases (
  id uuid primary key default gen_random_uuid(),
  source text not null check (length(trim(source)) between 1 and 100),
  alias text not null check (length(trim(alias)) between 1 and 240),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  normalized_alias text not null check (length(trim(normalized_alias)) between 1 and 240),
  created_at timestamptz not null default now(),
  unique (source, normalized_alias)
);

create index if not exists staff_aliases_profile_id_idx
  on public.staff_aliases(profile_id);

alter table public.staff_aliases enable row level security;
revoke all on table public.staff_aliases from anon, authenticated;
grant select on table public.staff_aliases to authenticated;
grant all on table public.staff_aliases to service_role;

drop policy if exists "active_users_read_staff_aliases" on public.staff_aliases;
create policy "active_users_read_staff_aliases"
on public.staff_aliases for select to authenticated
using (public.current_user_active());

alter table public.tasks
  add column if not exists task_date date,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

revoke all on table public.tasks from anon, authenticated;
grant select on table public.tasks to authenticated;
grant all on table public.tasks to service_role;

drop policy if exists "active_users_read_tasks" on public.tasks;
create policy "active_users_read_tasks"
on public.tasks for select to authenticated
using (public.current_user_active() and deleted_at is null);

update public.tasks
set task_date = case
  when coalesce(raw_payload ->> 'taskDate', '') ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    and to_char(to_date(raw_payload ->> 'taskDate', 'YYYY-MM-DD'), 'YYYY-MM-DD') = raw_payload ->> 'taskDate'
    then to_date(raw_payload ->> 'taskDate', 'YYYY-MM-DD')
  when coalesce(raw_payload ->> 'task_date', '') ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    and to_char(to_date(raw_payload ->> 'task_date', 'YYYY-MM-DD'), 'YYYY-MM-DD') = raw_payload ->> 'task_date'
    then to_date(raw_payload ->> 'task_date', 'YYYY-MM-DD')
  when coalesce(raw_payload ->> 'date', '') ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    and to_char(to_date(raw_payload ->> 'date', 'YYYY-MM-DD'), 'YYYY-MM-DD') = raw_payload ->> 'date'
    then to_date(raw_payload ->> 'date', 'YYYY-MM-DD')
  else deadline
end
where task_date is null;

create index if not exists tasks_owner_task_date_active_idx
  on public.tasks(owner_id, task_date)
  where deleted_at is null;
create index if not exists tasks_created_by_task_date_active_idx
  on public.tasks(created_by, task_date)
  where deleted_at is null;
create index if not exists tasks_status_task_date_active_idx
  on public.tasks(status, task_date)
  where deleted_at is null;
create index if not exists tasks_completed_at_active_idx
  on public.tasks(completed_at)
  where deleted_at is null and completed_at is not null;
create index if not exists tasks_deleted_at_idx
  on public.tasks(deleted_at)
  where deleted_at is not null;
create index if not exists tasks_deleted_by_idx
  on public.tasks(deleted_by)
  where deleted_by is not null;

comment on table public.documents is
  'Document catalog. External links remain server-validated; private files are opened through short-lived Storage signed URLs.';
comment on column public.documents.is_active is
  'Soft-delete flag. Inactive documents are retained for audit and can only be listed through an authorized server route.';
comment on table public.staff_aliases is
  'Maps historical source names to canonical profile IDs for deterministic reporting.';
comment on column public.tasks.task_date is
  'Canonical work date used for period reporting; backfilled from legacy payload dates and then deadline.';
comment on column public.tasks.deleted_at is
  'Soft-delete timestamp. Deleted tasks are excluded from normal work-item reads and Honors scoring.';
