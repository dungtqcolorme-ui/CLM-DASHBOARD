import { MarketingError } from "@/lib/marketing/domain";
import type { MarketingContent } from "@/lib/marketing/types";
import type { DnaPayload, DnaProfile, EvidenceRef, KnowledgeCommand, KnowledgeFact, KnowledgeSource, MarketingIdea } from "@/lib/marketing/knowledge-types";

function invalid(field: string): never { throw new MarketingError(`Giá trị ${field} không hợp lệ.`, 400, "invalid_input"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("dữ liệu");
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)) || allowed.some((key) => !Object.hasOwn(value, key))) invalid("trường dữ liệu");
}
function text(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || value.includes("\0") || (required && !value.trim())) invalid(field);
  return value.trim();
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) invalid("UUID");
  return value.toLowerCase();
}
function nullableId(value: unknown) { return value === null ? null : uuid(value); }
function version(value: unknown, zero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (zero ? 0 : 1)) invalid("phiên bản");
  return value as number;
}
function choice<T extends string>(value: unknown, choices: readonly T[], field: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) invalid(field);
  return value as T;
}
function date(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) invalid("ngày");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid("ngày");
  return value;
}
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid("thời gian có múi giờ");
  date(value.slice(0, 10));
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19) || "0") > 59) invalid("giờ");
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) invalid("thời gian");
  const normalized = result.toISOString();
  if (!/^[1-9]\d{3}-/.test(normalized)) invalid("năm UTC");
  return normalized;
}
export function normalizeKnowledgeUrl(value: unknown): string | null {
  if (value === null) return null;
  const input = text(value, "URL nguồn", 2000, true);
  if (/[\u0000-\u0020\u007f]/.test(input)) invalid("URL nguồn");
  let url: URL;
  try { url = new URL(input); } catch { return invalid("URL nguồn"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname) ||
    /\.(?:localhost|local|internal|test|invalid|example)$/i.test(url.hostname)) invalid("URL công khai HTTPS");
  for (const [key, val] of url.searchParams) {
    if (/^(?:access_token|refresh_token|api_key|token|secret|password|code|signature|key|authorization|credentials?)$/i.test(key)
      || /(?:sk-(?:proj-)?[a-z0-9_-]{10,}|Bearer\s)/i.test(val)) invalid("URL chứa thông tin xác thực");
  }
  url.hash = "";
  const normalized = url.toString();
  if (normalized.length > 2000) invalid("URL nguồn");
  return normalized;
}
function factIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10) invalid("dẫn chứng");
  const ids = value.map(uuid);
  if (new Set(ids).size !== ids.length) invalid("dẫn chứng trùng");
  return ids;
}
function dna(value: unknown, scope: string): DnaPayload {
  const payload = record(value); fields(payload, ["voice", "hooks", "cta", "visual_notes", "hard_rules"]);
  if (!Array.isArray(payload.hard_rules) || payload.hard_rules.length > 20 || (scope !== "master" && payload.hard_rules.length)) invalid("quy tắc Master DNA");
  return { voice: text(payload.voice, "giọng văn", 2000), hooks: text(payload.hooks, "hook", 2000), cta: text(payload.cta, "CTA", 2000), visual_notes: text(payload.visual_notes, "quy chuẩn hình ảnh", 4000), hard_rules: payload.hard_rules.map((rule) => text(rule, "quy tắc Master", 200, true)) };
}

export function parseKnowledgeCommand(value: unknown): KnowledgeCommand {
  const input = record(value), action = input.action;
  if (action === "create_source") {
    fields(input, ["action", "team_id", "title", "kind", "url", "excerpt", "author", "published_at"]);
    const kind = choice(input.kind, ["member_brief", "official_website", "approved_history", "public_reference"], "loại nguồn");
    const url = normalizeKnowledgeUrl(input.url);
    if (!url && kind !== "member_brief") invalid("URL nguồn");
    return { action, team_id: uuid(input.team_id), title: text(input.title, "tiêu đề", 180, true), kind, url, excerpt: text(input.excerpt, "trích nội dung", 8000, true), author: input.author === null ? null : text(input.author, "tác giả", 200), published_at: date(input.published_at) };
  }
  if (action === "create_fact") {
    fields(input, ["action", "source_id", "claim", "claim_type", "category", "valid_until"]);
    return { action, source_id: uuid(input.source_id), claim: text(input.claim, "phát biểu", 2000, true), claim_type: choice(input.claim_type, ["fact", "hypothesis", "missing_verification"], "loại phát biểu"), category: choice(input.category, ["general", "course", "offer", "scholarship", "event", "people"], "nhóm dữ kiện"), valid_until: timestamp(input.valid_until) };
  }
  if (action === "review_source" || action === "review_fact") {
    fields(input, ["action", "id", "expected_version", "decision", "reason"]);
    const base = { id: uuid(input.id), expected_version: version(input.expected_version), reason: text(input.reason, "lý do review", 2000, true) };
    return action === "review_source" ? { action, ...base, decision: choice(input.decision, ["approve", "revoke"], "review nguồn") } : { action, ...base, decision: choice(input.decision, ["verify", "dispute"], "review dữ kiện") };
  }
  if (action === "run_research") {
    fields(input, ["action", "campaign_id", "mode", "query"]);
    return { action, campaign_id: uuid(input.campaign_id), mode: choice(input.mode, ["auto", "internal_only", "deep_research"], "chế độ nghiên cứu"), query: text(input.query, "câu hỏi nghiên cứu", 2000, true) };
  }
  if (action === "generate_internal_ideas") {
    fields(input, ["action", "run_id", "content_line"]);
    return { action, run_id: uuid(input.run_id), content_line: choice(input.content_line, ["ColorMAP", "Sharing", "Meme", "InsideME"], "tuyến bài") };
  }
  if (action === "create_idea" || action === "update_idea") {
    fields(input, ["action", "title", "objective", "hook", "caption", "content_line", "rationale", "planned_for", "fact_ids", ...(action === "create_idea" ? ["campaign_id"] : ["id", "expected_version"])]);
    const content = { title: text(input.title, "tiêu đề", 180, true), objective: text(input.objective, "mục tiêu", 5000), hook: text(input.hook, "hook", 2000), caption: text(input.caption, "caption", 12000), content_line: choice(input.content_line, ["ColorMAP", "Sharing", "Meme", "InsideME"], "tuyến bài"), rationale: text(input.rationale, "lý do phù hợp", 2000), planned_for: timestamp(input.planned_for), fact_ids: factIds(input.fact_ids) };
    return action === "create_idea" ? { action, ...content, campaign_id: uuid(input.campaign_id) } : { action, ...content, id: uuid(input.id), expected_version: version(input.expected_version) };
  }
  if (action === "propose_dna") {
    fields(input, ["action", "scope", "team_id", "content_id", "base_version", "proposed", "reason"]);
    const scope = choice(input.scope, ["master", "team", "post"], "cấp DNA"), team_id = nullableId(input.team_id), content_id = nullableId(input.content_id);
    if ((scope === "master" && (team_id || content_id)) || (scope === "team" && (!team_id || content_id)) || (scope === "post" && (!team_id || !content_id))) invalid("phạm vi DNA");
    return { action, scope, team_id, content_id, base_version: version(input.base_version, true), proposed: dna(input.proposed, scope), reason: text(input.reason, "lý do thay đổi", 2000, true) };
  }
  if (action === "apply_dna") {
    fields(input, ["action", "id", "expected_version", "confirmed"]);
    if (input.confirmed !== true) invalid("xác nhận áp dụng DNA");
    return { action, id: uuid(input.id), expected_version: version(input.expected_version), confirmed: true };
  }
  if (action === "reject_dna") {
    fields(input, ["action", "id", "expected_version", "reason"]);
    return { action, id: uuid(input.id), expected_version: version(input.expected_version), reason: text(input.reason, "lý do từ chối", 2000, true) };
  }
  const transition = choice(action, ["select_idea", "dismiss_idea"], "thao tác");
  fields(input, ["action", "id", "expected_version"]);
  return { action: transition, id: uuid(input.id), expected_version: version(input.expected_version) };
}

export function isEvidenceCurrent(ref: EvidenceRef, facts: readonly KnowledgeFact[], sources: readonly KnowledgeSource[], now: Date | number = Date.now()): boolean {
  const fact = facts.find((entry) => entry.id === ref.fact_id), source = sources.find((entry) => entry.id === ref.source_id);
  const clock = now instanceof Date ? now.getTime() : now;
  if (!fact || !source || fact.source_id !== source.id || fact.team_id !== source.team_id || fact.version !== ref.fact_version || source.version !== ref.source_version || fact.status !== "verified" || fact.claim_type !== "fact" || source.status !== "approved") return false;
  if (fact.category !== "general" && !fact.valid_until) return false;
  return !fact.valid_until || (Number.isFinite(new Date(fact.valid_until).getTime()) && new Date(fact.valid_until).getTime() > clock);
}

export function effectiveDna(profiles: readonly DnaProfile[], teamId: string | null, contentId?: string): DnaPayload {
  const master = profiles.find((entry) => entry.scope === "master");
  const team = profiles.find((entry) => entry.scope === "team" && teamId !== null && entry.team_id === teamId);
  const post = profiles.find((entry) => entry.scope === "post" && teamId !== null && entry.team_id === teamId && contentId && entry.content_id === contentId);
  const result: DnaPayload = { voice: "", hooks: "", cta: "", visual_notes: "", hard_rules: [...(master?.payload.hard_rules ?? [])] };
  for (const profile of [master, team, post]) for (const field of ["voice", "hooks", "cta", "visual_notes"] as const) {
    if (profile?.payload[field]?.trim()) result[field] = profile.payload[field];
  }
  return result;
}

export function exactDuplicateIdeas(candidate: Pick<MarketingIdea, "title" | "caption">, ideas: readonly Pick<MarketingIdea, "id" | "title" | "caption">[], content: readonly Pick<MarketingContent, "id" | "title" | "caption">[], excludeId?: string) {
  const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
  const title = normalized(candidate.title), caption = normalized(candidate.caption);
  const matches = (entry: { title: string; caption: string }) => Boolean((title && normalized(entry.title) === title) || (caption && normalized(entry.caption) === caption));
  return [...ideas.filter((entry) => entry.id !== excludeId && matches(entry)).map((entry) => ({ id: entry.id, title: entry.title, kind: "idea" as const })), ...content.filter(matches).map((entry) => ({ id: entry.id, title: entry.title, kind: "content" as const }))];
}
