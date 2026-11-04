import type { AuthProfile } from "@/lib/authTypes";
import type { ContentMix, KpiDraft, MarketingCommand } from "./types";

export class MarketingError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "invalid_input") {
    super(message); this.status = status; this.code = code;
  }
}

export const CONTENT_LINES = ["ColorMAP", "Sharing", "Meme", "InsideME"] as const;
export const DEFAULT_CONTENT_MIX: ContentMix = { ColorMAP: 25, Sharing: 25, Meme: 25, InsideME: 25 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(field: string): never { throw new MarketingError(`Giá trị ${field} không hợp lệ.`); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("dữ liệu");
  return value as Record<string, unknown>;
}
function keys(record: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(record).some((key) => !allowed.includes(key))) invalid("trường dữ liệu");
}
function string(value: unknown, field: string, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()) || value.includes("\0")) invalid(field);
  return value.trim();
}
function uuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid(field);
  return value;
}
function version(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid("phiên bản");
  return value as number;
}
function choice<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(field);
  return value as T;
}
function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid("ngày");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid("ngày");
  return value;
}
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid("thời gian (cần múi giờ)");
  date(value.slice(0, 10));
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19) || "0") > 59) invalid("giờ");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) invalid("thời gian");
  return parsed.toISOString();
}
export function vietnamLocalToUtc(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) invalid("thời gian");
  return timestamp(`${value}:00+07:00`);
}
export function utcToVietnamLocal(value: string | null): string {
  if (!value) return "";
  const utc = timestamp(value);
  return new Date(new Date(utc!).getTime() + 7 * 3600000).toISOString().slice(0, 16);
}
export function validateContentMix(value: unknown): ContentMix {
  const mix = object(value);
  keys(mix, [...CONTENT_LINES]);
  const values = CONTENT_LINES.map((line) => mix[line]);
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 100)
      || Math.abs((values as number[]).reduce((sum, v) => sum + v, 0) - 100) > 0.000001) invalid("Content Mix (tổng phải bằng 100%)");
  return mix as ContentMix;
}
function kpis(value: unknown): KpiDraft[] {
  if (!Array.isArray(value) || value.length > 12) invalid("KPI");
  return value.map((entry) => {
    const kpi = object(entry); keys(kpi, ["name", "target", "unit"]);
    if (kpi.target !== null && (typeof kpi.target !== "number" || !Number.isFinite(kpi.target) || kpi.target < 0 || kpi.target > 1e12)) invalid("mục tiêu KPI");
    return { name: string(kpi.name, "tên KPI", 120, true), target: kpi.target as number | null, unit: string(kpi.unit, "đơn vị KPI", 40, true) };
  });
}

export function canReviewContent(profile: Pick<AuthProfile, "id" | "roles" | "status">, item: { creator_id: string; team_id: string }, teamIds: string[]) {
  return profile.status === "active" && profile.id !== item.creator_id &&
    (profile.roles.includes("Admin") || (profile.roles.includes("PR Leader") && teamIds.includes(item.team_id)));
}

export function parseMarketingCommand(value: unknown): MarketingCommand {
  const input = object(value);
  const action = input.action;
  if (action === "create_team") {
    keys(input, ["action", "name"]);
    return { action, name: string(input.name, "tên team", 120, true) };
  }
  if (action === "set_member") {
    keys(input, ["action", "team_id", "user_id", "enabled"]);
    if (typeof input.enabled !== "boolean") invalid("thành viên");
    return { action, team_id: uuid(input.team_id, "team"), user_id: uuid(input.user_id, "thành viên"), enabled: input.enabled };
  }
  if (action === "create_campaign" || action === "update_campaign") {
    keys(input, ["action", "name", "kind", "objective", "audience", "message", "start_date", "end_date", ...(action === "create_campaign" ? ["team_id"] : ["id", "expected_version"])]);
    const start = date(input.start_date), end = date(input.end_date);
    if (start && end && start > end) invalid("ngày kết thúc");
    const fields = { name: string(input.name, "tên Campaign", 180, true), kind: choice(input.kind, ["seasonal", "always_on"], "loại Campaign"), objective: string(input.objective, "mục tiêu", 5000), audience: string(input.audience, "đối tượng", 5000), message: string(input.message, "thông điệp", 5000), start_date: start, end_date: end };
    return action === "create_campaign" ? { action, ...fields, team_id: uuid(input.team_id, "team") } : { action, ...fields, id: uuid(input.id, "Campaign"), expected_version: version(input.expected_version) };
  }
  if (action === "update_plan") {
    keys(input, ["action", "id", "expected_version", "content_mix", "plan", "kpi_draft"]);
    return { action, id: uuid(input.id, "Campaign"), expected_version: version(input.expected_version), content_mix: validateContentMix(input.content_mix), plan: string(input.plan, "kế hoạch", 50000), kpi_draft: kpis(input.kpi_draft) };
  }
  if (action === "create_content" || action === "update_content") {
    keys(input, ["action", "title", "caption", "content_line", "assignee_id", "production_status", "production_due_at", "review_due_at", "proposed_publish_at", ...(action === "create_content" ? ["campaign_id"] : ["id", "expected_version"])]);
    const fields = { title: string(input.title, "tiêu đề", 180, true), caption: string(input.caption, "caption", 12000), content_line: choice(input.content_line, CONTENT_LINES, "tuyến bài"), assignee_id: input.assignee_id === null ? null : uuid(input.assignee_id, "người phụ trách"), production_status: choice(input.production_status, ["not_started", "writing", "designing", "editing", "ready"], "trạng thái sản xuất"), production_due_at: timestamp(input.production_due_at), review_due_at: timestamp(input.review_due_at), proposed_publish_at: timestamp(input.proposed_publish_at) };
    return action === "create_content" ? { action, ...fields, campaign_id: uuid(input.campaign_id, "Campaign") } : { action, ...fields, id: uuid(input.id, "nội dung"), expected_version: version(input.expected_version) };
  }
  const transitions = ["submit_activation", "activate_campaign", "pause_campaign", "resume_campaign", "complete_campaign", "archive_campaign", "emergency_hold", "submit_review", "request_changes"] as const;
  const transition = choice(action, transitions, "thao tác");
  keys(input, ["action", "id", "expected_version", ...(transition === "emergency_hold" || transition === "request_changes" ? ["reason"] : [])]);
  const base = { id: uuid(input.id, "bản ghi"), expected_version: version(input.expected_version) };
  if (transition === "emergency_hold") return { action: transition, ...base, reason: string(input.reason, "lý do", 2000, true) };
  if (transition === "request_changes") return { action: transition, ...base, reason: string(input.reason, "lý do chỉnh sửa", 2000, true) };
  return { action: transition, ...base };
}
