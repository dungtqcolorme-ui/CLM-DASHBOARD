revoke all on table public.documents from anon, authenticated;
grant select on table public.documents to authenticated;
grant all on table public.documents to service_role;

revoke all on table public.staff_aliases from anon, authenticated;
grant select on table public.staff_aliases to authenticated;
grant all on table public.staff_aliases to service_role;

revoke all on table public.tasks from anon, authenticated;
grant select on table public.tasks to authenticated;
grant all on table public.tasks to service_role;

comment on table public.documents is
  'Writes are server-only through role-checked API routes. Authenticated clients receive SELECT only.';
comment on table public.staff_aliases is
  'Alias management is server-only. Authenticated clients receive SELECT only.';
