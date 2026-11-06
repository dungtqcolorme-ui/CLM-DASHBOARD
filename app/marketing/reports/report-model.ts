import type { MarketingReport, ReportShareApproval } from "@/lib/marketing/report-types";

export function periodEnd(kind: MarketingReport["kind"], start: string) {
  if (!start) return "";
  const date = new Date(start + "T00:00:00Z");
  if (!Number.isFinite(date.getTime())) return "";
  if (kind === "weekly") date.setUTCDate(date.getUTCDate() + 6);
  else date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

export async function narrativeDigest(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function exactApproval(report: MarketingReport, narrativeHash: string, approvals: ReportShareApproval[]) {
  return approvals.find((approval) => approval.report_id === report.id
    && approval.report_version === report.version && approval.metrics_hash === report.metrics_hash
    && approval.narrative_hash === narrativeHash);
}
