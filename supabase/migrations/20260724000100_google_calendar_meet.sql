create table if not exists public.google_calendar_integrations (
  id text primary key check (id = 'primary'),
  google_account_email text not null default '',
  refresh_token_ciphertext text not null,
  scopes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meetings
  add column if not exists google_event_id text not null default '',
  add column if not exists google_calendar_link text not null default '',
  add column if not exists google_sync_status text not null default 'not_connected'
    check (google_sync_status in ('not_connected', 'synced', 'error')),
  add column if not exists google_sync_error text not null default '',
  add column if not exists google_synced_at timestamptz;

create index if not exists meetings_google_event_idx
  on public.meetings(google_event_id)
  where google_event_id <> '';

alter table public.google_calendar_integrations enable row level security;

revoke all on table public.google_calendar_integrations from anon, authenticated;
grant all on table public.google_calendar_integrations to service_role;

comment on table public.google_calendar_integrations is
  'Server-only Google Calendar OAuth integration. Refresh tokens are encrypted before storage.';

comment on column public.meetings.google_event_id is
  'Stable Google Calendar event ID generated from the CLM meeting ID.';
