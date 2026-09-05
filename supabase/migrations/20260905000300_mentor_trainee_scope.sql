create extension if not exists pgcrypto;

create table if not exists public.mentor_trainees (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  constraint mentor_trainees_distinct_people check (mentor_id <> trainee_id),
  constraint mentor_trainees_revocation_audit check (
    (revoked_at is null and revoked_by is null)
    or revoked_at is not null
  )
);

create unique index if not exists mentor_trainees_active_pair_idx
  on public.mentor_trainees(mentor_id, trainee_id)
  where revoked_at is null;
create index if not exists mentor_trainees_mentor_active_idx
  on public.mentor_trainees(mentor_id, trainee_id)
  where revoked_at is null;
create index if not exists mentor_trainees_trainee_active_idx
  on public.mentor_trainees(trainee_id, mentor_id)
  where revoked_at is null;
create index if not exists mentor_trainees_assigned_by_idx
  on public.mentor_trainees(assigned_by)
  where assigned_by is not null;
create index if not exists mentor_trainees_revoked_by_idx
  on public.mentor_trainees(revoked_by)
  where revoked_by is not null;

alter table public.mentor_trainees enable row level security;
revoke all on table public.mentor_trainees from anon, authenticated;
grant select on table public.mentor_trainees to authenticated;
grant all on table public.mentor_trainees to service_role;

drop policy if exists "mentor_or_admin_reads_active_assignments" on public.mentor_trainees;
create policy "mentor_or_admin_reads_active_assignments"
on public.mentor_trainees for select to authenticated
using (
  public.current_user_active()
  and revoked_at is null
  and (
    public.has_app_role('Admin')
    or (
      mentor_id = (select auth.uid())
      and public.has_app_role('PR Leader')
    )
  )
);

comment on table public.mentor_trainees is
  'Auditable Mentor–Trainee assignments. PR Leader is the current mentor-capable role and PR Representative is the trainee-capable role; server APIs validate both roles.';
comment on column public.mentor_trainees.revoked_at is
  'Soft revocation timestamp. Historical assignments remain available to service-role audit flows.';
