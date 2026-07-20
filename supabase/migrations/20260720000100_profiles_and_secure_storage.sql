create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  status text not null default 'pending' check (status in ('active', 'pending', 'locked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('Admin', 'PR Leader', 'PR Representative', 'Viewer')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_app_meta_data ->> 'status', 'pending')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.current_user_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.has_app_role(required_role text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = required_role
  );
$$;

grant execute on function public.current_user_active() to authenticated;
grant execute on function public.has_app_role(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

revoke all on table public.profiles, public.user_roles from anon;
grant select on table public.profiles, public.user_roles to authenticated;
grant all on table public.profiles, public.user_roles to service_role;

drop policy if exists "profiles_select_self_or_manager" on public.profiles;
create policy "profiles_select_self_or_manager"
on public.profiles for select to authenticated
using (id = auth.uid() or public.has_app_role('Admin') or public.has_app_role('PR Leader'));

drop policy if exists "user_roles_select_self_or_manager" on public.user_roles;
create policy "user_roles_select_self_or_manager"
on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_app_role('Admin') or public.has_app_role('PR Leader'));

do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (
        coalesce(qual, '') ilike any (array['%clm-dashboard-private%','%clm-dashboard-state%','%clm-dashboard-uploads%'])
        or coalesce(with_check, '') ilike any (array['%clm-dashboard-private%','%clm-dashboard-state%','%clm-dashboard-uploads%'])
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_row.policyname);
  end loop;
end $$;

create policy "active_users_read_private_dashboard"
on storage.objects for select to authenticated
using (bucket_id = 'clm-dashboard-private' and public.current_user_active());

create policy "active_users_read_dashboard_state"
on storage.objects for select to authenticated
using (bucket_id = 'clm-dashboard-state' and public.current_user_active());
create policy "active_users_insert_dashboard_state"
on storage.objects for insert to authenticated
with check (bucket_id = 'clm-dashboard-state' and public.current_user_active());
create policy "active_users_update_dashboard_state"
on storage.objects for update to authenticated
using (bucket_id = 'clm-dashboard-state' and public.current_user_active())
with check (bucket_id = 'clm-dashboard-state' and public.current_user_active());
create policy "active_users_delete_dashboard_state"
on storage.objects for delete to authenticated
using (bucket_id = 'clm-dashboard-state' and public.current_user_active());

create policy "active_users_read_own_uploads"
on storage.objects for select to authenticated
using (bucket_id = 'clm-dashboard-uploads' and public.current_user_active() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "active_users_insert_own_uploads"
on storage.objects for insert to authenticated
with check (bucket_id = 'clm-dashboard-uploads' and public.current_user_active() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "active_users_update_own_uploads"
on storage.objects for update to authenticated
using (bucket_id = 'clm-dashboard-uploads' and public.current_user_active() and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'clm-dashboard-uploads' and public.current_user_active() and (storage.foldername(name))[1] = auth.uid()::text);
create policy "active_users_delete_own_uploads"
on storage.objects for delete to authenticated
using (bucket_id = 'clm-dashboard-uploads' and public.current_user_active() and (storage.foldername(name))[1] = auth.uid()::text);

do $$
declare policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'dashboard_state_meta'
  loop
    execute format('drop policy if exists %I on public.dashboard_state_meta', policy_row.policyname);
  end loop;
end $$;

alter table public.dashboard_state_meta enable row level security;
create policy "active_users_select_state_meta"
on public.dashboard_state_meta for select to authenticated
using (public.current_user_active());
create policy "active_users_insert_state_meta"
on public.dashboard_state_meta for insert to authenticated
with check (public.current_user_active());
create policy "active_users_update_state_meta"
on public.dashboard_state_meta for update to authenticated
using (public.current_user_active())
with check (public.current_user_active());
