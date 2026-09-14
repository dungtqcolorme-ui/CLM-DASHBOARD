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
read-only and all scope checks are repeated in the server API. Access time for all four application roles is recorded once per application load in
`profiles.last_seen_at`, while profiles without a recorded visit display **Chưa truy cập**.


## Account and performance regression checks

`pnpm verify` runs lint, TypeScript, unit/API regression tests, dashboard source
checks and the production build. Its runner also works directly with
`node scripts/verify.mjs` when npm is unavailable.

Apply `supabase/migrations/20260913175631_account_access_and_load_events.sql`
before deploying this release to another database. This additive migration is
already applied to the connected CLM DASHBOARD project. The follow-up migration
`20260914024352_backfill_verified_sign_in_activity.sql` restores missing old-account
activity only from Auth’s real `last_sign_in_at`, preserving newer app loads.
Account deactivation
locks the existing profile and bans Auth sign-in; it preserves role assignments,
task ownership, work history and source scores. Unlocking restores access.

The score API reads the existing Google Sheet on the server and returns a
validated course/week/person structure. Missing scores remain null. Live task
UUIDs are matched to historical score identities where the existing name mapping
is unambiguous; other current staff remain separate.

`supabase/tests/account_access.test.sql` validates durable access events,
duplicate loads, last-active-admin protection and private RPC permissions inside
a transaction that rolls back. `node scripts/test-http-auth.mjs` verifies the
private HTTP routes against a running production server (default port 3100).
Full authenticated end-to-end tests additionally require the server-only
`SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and disposable test accounts.
