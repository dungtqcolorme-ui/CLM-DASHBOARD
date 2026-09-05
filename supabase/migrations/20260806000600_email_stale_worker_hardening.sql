create index if not exists tasks_deadline_active_idx
  on public.tasks(deadline)
  where deleted_at is null;

create or replace function private.claim_email_jobs_internal(
  worker_id text,
  batch_size integer default 20
)
returns setof public.email_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A worker can disappear after Gmail accepted a message but before the
  -- application persisted the provider response. Treat that state as
  -- ambiguous and require a manager to resend explicitly; an automatic
  -- retry could deliver the same email twice.
  update public.email_job_attempts attempt
  set status = 'failed',
      error_message = case
        when attempt.error_message = '' then 'Worker trước không hoàn tất; kết quả gửi không xác định và cần kiểm tra thủ công.'
        else left(attempt.error_message || ' Worker trước không hoàn tất; kết quả gửi không xác định và cần kiểm tra thủ công.', 2000)
      end,
      finished_at = now()
  where attempt.status = 'processing'
    and exists (
      select 1
      from public.email_jobs job
      where job.id = attempt.job_id
        and job.status = 'processing'
        and job.locked_at < now() - interval '10 minutes'
    );

  update public.email_jobs
  set status = 'failed',
      retry_count = retry_count + 1,
      locked_at = null,
      locked_by = '',
      next_attempt_at = null,
      error_message = case
        when error_message = '' then 'Worker trước không hoàn tất; kết quả gửi không xác định và cần kiểm tra thủ công.'
        else left(error_message || ' Worker trước không hoàn tất; kết quả gửi không xác định và cần kiểm tra thủ công.', 2000)
      end
  where status = 'processing'
    and locked_at < now() - interval '10 minutes';

  return query
  with candidates as (
    select job.id
    from public.email_jobs job
    where job.status in ('pending', 'failed')
      and job.scheduled_for <= now()
      and (
        (job.status = 'pending' and coalesce(job.next_attempt_at, job.scheduled_for) <= now())
        or (job.status = 'failed' and job.next_attempt_at is not null and job.next_attempt_at <= now())
      )
      and job.retry_count <= job.max_retries
    order by coalesce(job.next_attempt_at, job.scheduled_for), job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(batch_size, 20), 100))
  ), claimed as (
    update public.email_jobs job
    set status = 'processing',
        locked_at = now(),
        locked_by = left(coalesce(worker_id, ''), 120),
        error_message = ''
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select * from claimed;
end;
$$;

revoke all on function private.claim_email_jobs_internal(text, integer) from public, anon, authenticated;
grant execute on function private.claim_email_jobs_internal(text, integer) to service_role;

comment on function private.claim_email_jobs_internal(text, integer) is
  'Atomically claims due email jobs. Stale workers are never auto-retried because their Gmail delivery result is ambiguous.';
