-- App loads are explicit events, not profile edits or background heartbeats.
create table public.profile_access_loads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  load_id text not null check (length(load_id) between 1 and 120),
  seen_at timestamptz not null default clock_timestamp(),
  primary key (user_id, load_id)
);
alter table public.profile_access_loads enable row level security;
revoke all on public.profile_access_loads from anon, authenticated;
grant select, insert on public.profile_access_loads to service_role;

create or replace function public.record_profile_app_load(p_user_id uuid, p_load_id text)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare v_seen timestamptz;
begin
  -- Serialize loads for one profile; concurrent retries write only once.
  perform 1 from public.profiles where id=p_user_id and status='active' for update;
  if not found then raise exception 'Tài khoản không hoạt động.' using errcode='42501'; end if;
  insert into public.profile_access_loads(user_id,load_id) values(p_user_id,p_load_id)
    on conflict do nothing returning seen_at into v_seen;
  if v_seen is not null then
    update public.profiles set last_seen_at=greatest(coalesce(last_seen_at,v_seen),v_seen) where id=p_user_id;
  end if;
  return (select last_seen_at from public.profiles where id=p_user_id);
end;
$$;
revoke all on function public.record_profile_app_load(uuid,text) from public,anon,authenticated;
grant execute on function public.record_profile_app_load(uuid,text) to service_role;

create or replace function public.set_profile_access_status(p_user_id uuid, p_status text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_old text;
begin
  if p_status not in ('active','pending','locked') or p_status is null then
    raise exception 'Trạng thái tài khoản không hợp lệ.' using errcode='22023';
  end if;
  -- Two administrators cannot simultaneously disable the last active admins.
  perform pg_catalog.pg_advisory_xact_lock(713409221);
  select status into v_old from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Không tìm thấy tài khoản.' using errcode='P0002'; end if;
  if v_old='active' and p_status<>'active'
    and exists(select 1 from public.user_roles where user_id=p_user_id and role='Admin')
    and not exists(select 1 from public.profiles p join public.user_roles r on r.user_id=p.id
      where r.role='Admin' and p.status='active' and p.id<>p_user_id) then
    raise exception 'Hệ thống phải còn ít nhất một Admin hoạt động.' using errcode='23514';
  end if;
  update public.profiles set status=p_status where id=p_user_id;
  return p_status;
end;
$$;
revoke all on function public.set_profile_access_status(uuid,text) from public,anon,authenticated;
grant execute on function public.set_profile_access_status(uuid,text) to service_role;
comment on column public.profiles.last_seen_at is
  'Last authenticated application load for any role; null means no recorded visit. Never derived from account/task edits.';
