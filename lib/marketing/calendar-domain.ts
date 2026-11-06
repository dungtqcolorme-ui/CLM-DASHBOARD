import { utcToVietnamLocal } from "@/lib/marketing/domain";
import { inputTimestamp } from "@/lib/marketing/input";
import type { PublishingIncident, PublishingJob } from "@/lib/marketing/publishing-types";
import type { MarketingContent, PublishingStatus } from "@/lib/marketing/types";

export type CalendarJobRow = Pick<PublishingJob, "id" | "team_id" | "campaign_id" | "content_id" | "candidate_id"
  | "approval_id" | "connection_id" | "status" | "scheduled_for" | "remote_id" | "receipt" | "created_at">;
export type CalendarApprovalRow = {
  id: string; team_id: string; content_id: string; approver_id: string; content_version: number;
  created_at: string; snapshot: Record<string, unknown>;
};
export type CalendarIncidentRow = Pick<PublishingIncident, "id" | "team_id" | "campaign_id" | "content_id" | "job_id" | "severity" | "status">;
export type CalendarPublication = {
  id: string; teamId: string; campaignId: string; contentId: string; createdAt: string;
  status: PublishingJob["status"];
  approval: { at: string | null; slot: string; approverId: string; contentVersion: number; pageName: string | null } | null;
  verification: "remote_scheduled" | "published" | null;
  observedAt: string | null;
};
export type CalendarAlert = {
  id: string; teamId: string; campaignId: string; contentId: string | null; jobId: string | null;
  severity: PublishingIncident["severity"]; status: "open" | "acknowledged";
};
export type CalendarEvidence = { publications: CalendarPublication[]; alerts: CalendarAlert[] };
export type CalendarState = Exclude<PublishingStatus, "approved" | "scheduled" | "published">
  | "internal_queue" | "dispatching" | "remote_scheduled" | "published_verified" | "unknown" | "cancel_pending" | "awaiting_evidence";
export type CalendarEntry = {
  item: MarketingContent; publication: CalendarPublication | null; alerts: CalendarAlert[];
  state: CalendarState; slot: { kind: "proposed" | "approved"; at: string } | null;
};

function safeTime(value: unknown): string | null {
  try { return inputTimestamp(value); } catch { return null; }
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function projectCalendarEvidence(jobs: CalendarJobRow[], approvals: CalendarApprovalRow[], incidents: CalendarIncidentRow[]): CalendarEvidence {
  const approvalById = new Map(approvals.map((approval) => [approval.id, approval]));
  const publications: CalendarPublication[] = jobs.map((job) => {
    const row = approvalById.get(job.approval_id);
    const snapshot = record(row?.snapshot);
    const connection = record(snapshot.connection);
    const slot = safeTime(snapshot.scheduled_for);
    const approval = row && row.team_id === job.team_id && row.content_id === job.content_id
      && snapshot.candidate_id === job.candidate_id && connection.id === job.connection_id
      && connection.provider === "facebook" && slot && slot === safeTime(job.scheduled_for)
      ? { at: safeTime(row.created_at), slot, approverId: row.approver_id, contentVersion: row.content_version,
        pageName: typeof connection.page_name === "string" ? connection.page_name : null }
      : null;
    const receipt = record(job.receipt);
    const verification = approval && (job.status === "published" || job.status === "remote_scheduled")
      && receipt.verified === true && job.remote_id
      && (!Object.hasOwn(receipt, "remote_id") || receipt.remote_id === job.remote_id)
      && (!Object.hasOwn(receipt, "state") || receipt.state === job.status)
      && (!Object.hasOwn(receipt, "status") || receipt.status === job.status) ? job.status : null;
    return {
      id: job.id, teamId: job.team_id, campaignId: job.campaign_id, contentId: job.content_id,
      createdAt: safeTime(job.created_at) ?? "", status: job.status, approval, verification,
      // This is when the remote response was observed, never when the post went live.
      observedAt: verification ? safeTime(receipt.observed_at) : null,
    };
  });
  const alerts: CalendarAlert[] = incidents.flatMap((incident) => incident.status === "resolved" ? [] : [{
    id: incident.id, teamId: incident.team_id, campaignId: incident.campaign_id,
    contentId: incident.content_id, jobId: incident.job_id, severity: incident.severity, status: incident.status,
  }]);
  return { publications, alerts };
}

function contentKey(team: string, campaign: string, content: string) { return `${team}/${campaign}/${content}`; }
function currentState(status: PublishingStatus, publication: CalendarPublication | null): CalendarState {
  if (status !== "approved" && status !== "scheduled" && status !== "published") return status;
  if (publication?.status === "unknown" || publication?.status === "cancel_pending") return publication.status;
  if (status === "published" && publication?.verification === "published") return "published_verified";
  if (status === "scheduled" && publication?.verification === "remote_scheduled") return "remote_scheduled";
  if (status === "approved" && publication?.approval) {
    if (publication.status === "queued" || publication.status === "claimed") return "internal_queue";
    if (publication.status === "dispatching") return "dispatching";
    if (publication.status === "failed" || publication.status === "dead_letter") return "failed";
  }
  return "awaiting_evidence";
}

export function calendarEntries(items: MarketingContent[], evidence: CalendarEvidence | null): CalendarEntry[] {
  const publications = new Map<string, CalendarPublication>();
  const alertsByContent = new Map<string, CalendarAlert[]>();
  const alertsByJob = new Map<string, CalendarAlert[]>();
  for (const row of evidence?.publications ?? []) {
    const key = contentKey(row.teamId, row.campaignId, row.contentId);
    const previous = publications.get(key);
    if (!previous || row.createdAt > previous.createdAt || (row.createdAt === previous.createdAt && row.id > previous.id)) publications.set(key, row);
  }
  for (const alert of evidence?.alerts ?? []) {
    const index = alert.contentId ? alertsByContent : alertsByJob;
    if (!alert.contentId && !alert.jobId) continue;
    const key = contentKey(alert.teamId, alert.campaignId, alert.contentId ?? alert.jobId!);
    const rows = index.get(key);
    if (rows) rows.push(alert);
    else index.set(key, [alert]);
  }
  return items.map((item) => {
    const key = contentKey(item.team_id, item.campaign_id, item.id);
    const publication = publications.get(key) ?? null;
    const alerts = [...(alertsByContent.get(key) ?? []), ...(publication ? alertsByJob.get(contentKey(item.team_id, item.campaign_id, publication.id)) ?? [] : [])];
    const state = currentState(item.publishing_status, publication);
    const proposed = safeTime(item.proposed_publish_at);
    const approved = ["approved", "scheduled", "published"].includes(item.publishing_status) ? publication?.approval?.slot : null;
    const slot = approved ? { kind: "approved" as const, at: approved } : proposed ? { kind: "proposed" as const, at: proposed } : null;
    return { item, publication, alerts, state, slot };
  });
}

export function calendarDay(value: string) { return utcToVietnamLocal(value).slice(0, 10); }
