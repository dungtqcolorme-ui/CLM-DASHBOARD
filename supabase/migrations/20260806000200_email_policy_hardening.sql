drop policy if exists "server_only_email_connections" on public.email_connections;
create policy "server_only_email_connections"
on public.email_connections for all to anon, authenticated
using (false)
with check (false);

drop policy if exists "server_only_system_settings" on public.system_settings;
create policy "server_only_system_settings"
on public.system_settings for all to anon, authenticated
using (false)
with check (false);

drop policy if exists "server_only_email_jobs" on public.email_jobs;
create policy "server_only_email_jobs"
on public.email_jobs for all to anon, authenticated
using (false)
with check (false);

drop policy if exists "server_only_email_job_attempts" on public.email_job_attempts;
create policy "server_only_email_job_attempts"
on public.email_job_attempts for all to anon, authenticated
using (false)
with check (false);

comment on policy "server_only_email_connections" on public.email_connections is
  'OAuth credentials are available only to trusted server routes through service_role.';
comment on policy "server_only_system_settings" on public.system_settings is
  'Email settings are read and changed only by authorized server routes.';
comment on policy "server_only_email_jobs" on public.email_jobs is
  'Recipient details and delivery history are server-only.';
comment on policy "server_only_email_job_attempts" on public.email_job_attempts is
  'Provider attempts and errors are server-only.';
