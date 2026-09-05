alter table public.profiles
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.last_seen_at is
  'Most recent explicit dashboard app load for management accounts; null means never recorded.';

-- A presence heartbeat must not make an otherwise unchanged profile look as
-- if its editable personal information was modified. This function is shared
-- with documents, so its normal behavior is preserved for every other table.
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_schema = 'public'
     and tg_table_name = 'profiles'
     and (to_jsonb(new) - 'updated_at' - 'last_seen_at')
       is not distinct from
       (to_jsonb(old) - 'updated_at' - 'last_seen_at') then
    new.updated_at = old.updated_at;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;
