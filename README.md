# CLM DASHBOARD

Next.js App Router project for the ColorME dashboard, connected to Supabase and
prepared for continuous deployment on Vercel.

## Local setup

1. Copy `.env.example` to `.env.local` and configure the Supabase, Google OAuth,
   site URL, token-encryption, and scheduler values documented in that file.
2. Install dependencies with `pnpm install`.
3. Run `pnpm dev` and open <http://localhost:3000>.
4. Check Supabase with `pnpm test:supabase` or open
   <http://localhost:3000/api/health/supabase>.
5. Run the release checks with `pnpm verify` before deploying.

`.env.local` is ignored by Git and must never be committed.

## Gmail and scheduled email

Gmail is connected as one server-side system account. OAuth requests only the
Calendar events and Gmail send scopes; the refresh token is AES-256-GCM
encrypted before it is stored in the server-only `email_connections` table.
Tokens are never returned to the dashboard.

After the new OAuth scopes are deployed, an Admin or PR Leader must reconnect
Google from **Quản lý tài khoản → Email & Gmail**. Meeting reminders and Daily
Report stay disabled until that screen has a connected Gmail account and valid
settings.

The dispatcher is exposed at `/api/cron/email-dispatch` and accepts only the
exact `Authorization: Bearer $CRON_SECRET` header. Set the same server-only
secret in the chosen scheduler before enabling scheduled email. Meeting
reminders need a one-minute schedule; the current Vercel Hobby team only allows
one run per day, so a misleading or deployment-breaking Vercel Cron definition
is intentionally not committed. Use Vercel Pro or a trusted one-minute external
scheduler for automatic reminders.

Automatic jobs use a unique idempotency key and transactional database claim;
manual sends are limited to three attempts per manager per ten minutes. Every
attempt is recorded in `email_jobs` and `email_job_attempts`.

## Document catalog and Honors

The tracked private dashboard release is documented in
[`dashboard/README.md`](dashboard/README.md). Legacy links are imported through
the authenticated server API and deduplicated by normalized document identity.
Unknown documents are retained under **Chưa phân loại**.

Honors calculations run on the server, resolve staff aliases to canonical user
IDs, filter by Vietnam calendar boundaries, and exclude deleted, demo, meeting,
duplicate, and rescheduled task records. The audit view lists included and
excluded records so the displayed score can be reconciled.

## Daily task management

Tasks use profile UUIDs as their stable identity, so profile name changes are
reflected without recreating users or rewriting historical task records. Daily
tasks support morning, afternoon, and legacy unassigned shifts. Authorized
users can duplicate a task while preserving its source lineage and resetting
the copied task to a safe initial state.

PR Leaders can review only the PR Representatives explicitly assigned to them
through `mentor_trainees`; Admin manages those assignments. Mentor views are
read-only and all scope checks are repeated in the server API. Admin and PR
Leader access time is recorded once per application load in
`profiles.last_seen_at`, while older profiles display **Chưa truy cập**.
