# Calendar reschedule implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline, with a final independent review.

**Goal:** Move a draft's proposed publication time from Calendar, with an explicit save and version conflict handling.

**Architecture:** Reuse the authenticated `update_content` command and its existing SQL transaction/version check. A focused Calendar form retains its original content version until the user explicitly adopts the current version. Native drag/drop opens the same form used by keyboard and touch users.

**Tech stack:** Existing Next.js, React, user-JWT Supabase RPC and Playwright/PGlite harness. No dependencies or schema changes.

**Spec:** `docs/marketing/MASTER_SPEC.txt` section 5; `docs/marketing/UIUX_ADDENDUM.md` section 3.5.

## Constraints and decisions

- Only writer roles, same-team Campaigns in Draft/Active, and Draft/Changes Requested content expose Calendar editing.
- Drag/drop preserves the Vietnam local hour, defaults undated content to 09:00, and does not write before Save.
- Approved/Scheduled content continues through cancellation/reconciliation and human review in Approval Inbox. Calendar never rewrites an approved slot.
- A time change preserves caption, production fields and Creator. Existing command semantics return Changes Requested to Draft.
- On version conflict, retain the entered time; refresh and require an explicit adoption of current content before retrying.
- No implicit publishing, external calls, migration, push or deploy. Keep existing unrelated changes out of the commit.

## Review focus

- Vietnam date boundaries and invalid dates must not normalize silently.
- External or stale drag payloads must not select a different item or trigger writes.
- Viewer, paused Campaign and approved content must remain read-only.
- Concurrent caption edits must not be overwritten by a stale Calendar save.
- Close/navigation/access reset must discard only this temporary Calendar proposal.

## Task 1: Calendar proposal editing

**Files:** `lib/marketing/calendar-schedule.ts`, `app/marketing/calendar/schedule-form.tsx`, Calendar page/CSS, Calendar tests and `scripts/marketing-calendar-ui-checks.mjs`/main harness, Marketing usage/readiness/runbook.

**Interfaces:** `canMoveCalendarContent(item, campaign, canWrite)`; `calendarDropTime(previousUtc, targetDay)`; `calendarScheduleCommand(baseContent, localTime)` producing the existing `update_content` command.

- [x] Write/run failing domain tests for eligibility, Vietnam drop times and preserving command fields/version.
- [x] Implement pure helpers, then run their tests.
- [x] Add browser coverage for drag/cancel/save, stale version/rebase, keyboard/mobile and Viewer/approved locks; implement the form and page integration.
- [x] Run full verification and production browser harness, inspect screenshots and resolve findings from an independent review.
- [x] Update docs and commit only this feature.

## Verification record · 2026-11-08

- `pnpm verify`: lint, TypeScript, 203 unit/API tests, dashboard release checks and production build passed.
- Production browser harness: 32 checks, no page errors, one legacy iframe load; actual API handlers and disposable PostgreSQL/RLS with synthetic identity/Storage fixtures.
- Dragging/closing/foreign drop never writes; save retains Creator/production fields, moves Vietnam time correctly and returns Changes Requested to Draft. Concurrent caption survives explicit rebase. Keyboard reopen, Escape, mobile layout, Viewer, paused Campaign and scheduled locks verified.
- Fixed an existing native-dialog race exposed by rapid close/reopen: React now controls close and handles Escape via `onCancel`; queued native close events cannot clear a newly opened detail.
- Independent feature review and focused dialog-fix review found no remaining actionable issues. Desktop/mobile screenshots inspected locally. Hosted Supabase/Storage and Meta remain outside this local acceptance.
