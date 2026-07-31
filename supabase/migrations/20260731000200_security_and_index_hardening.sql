alter function public.can_manage_owned_work_item(uuid) security invoker;

revoke all on function public.can_manage_owned_work_item(uuid) from public, anon;
grant execute on function public.can_manage_owned_work_item(uuid) to authenticated;

revoke execute on function public.can_write_operational_data() from public, anon;
revoke execute on function public.current_user_active() from public, anon;
revoke execute on function public.has_app_role(text) from public, anon;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create index if not exists dashboard_state_meta_updated_by_idx
  on public.dashboard_state_meta(updated_by);
create index if not exists meetings_created_by_idx
  on public.meetings(created_by);
create index if not exists tasks_completed_by_idx
  on public.tasks(completed_by)
  where completed_by is not null;
create index if not exists tasks_last_moved_by_idx
  on public.tasks(last_moved_by)
  where last_moved_by is not null;
create index if not exists work_comments_author_id_idx
  on public.work_comments(author_id);
create index if not exists work_history_actor_id_idx
  on public.work_history(actor_id);

drop policy if exists "profiles_select_self_or_manager" on public.profiles;
create policy "profiles_select_self_or_manager"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or public.has_app_role('Admin')
  or public.has_app_role('PR Leader')
);

drop policy if exists "user_roles_select_self_or_manager" on public.user_roles;
create policy "user_roles_select_self_or_manager"
on public.user_roles for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_app_role('Admin')
  or public.has_app_role('PR Leader')
);

drop policy if exists "users_read_own_notifications" on public.user_notifications;
create policy "users_read_own_notifications"
on public.user_notifications for select to authenticated
using (recipient_id = (select auth.uid()));

drop policy if exists "users_read_own_notification_dismissals" on public.notification_dismissals;
create policy "users_read_own_notification_dismissals"
on public.notification_dismissals for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "deny_direct_google_calendar_access" on public.google_calendar_integrations;
create policy "deny_direct_google_calendar_access"
on public.google_calendar_integrations for all to authenticated
using (false)
with check (false);

comment on policy "deny_direct_google_calendar_access" on public.google_calendar_integrations is
  'Google refresh tokens are server-only; authenticated clients receive no direct rows.';
