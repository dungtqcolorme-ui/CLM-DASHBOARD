import { gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HonorExternalMetrics,
  HonorPeriod,
  HonorProfile,
} from "@/lib/honors";

const STATE_BUCKET = "clm-dashboard-state";
const COMPRESSED_STATE_FILE = "main.json.gz";
const LEGACY_STATE_FILE = "main.json";
const MAX_COMPRESSED_STATE_BYTES = 20 * 1024 * 1024;
const MAX_STATE_BYTES = 50 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

export type HonorSourceStatus = {
  status: "available" | "unavailable";
  reason: string;
  matchedRows: number;
  skippedRows: number;
  updatedAt: string | null;
};

export type HonorSourceBundle = {
  externalMetrics: Map<string, HonorExternalMetrics>;
  sources: {
    b2CodeHd: HonorSourceStatus;
    workScoreSheet: HonorSourceStatus;
  };
};

type StatePerson = {
  id: string;
  alternateId: string;
  email: string;
  name: string;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function asRows(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

/**
 * Keep historical Q. Dung and current Qu. Dung distinct. The live profile named
 * Tran Quang Dung is the current Qu. Dung identity used by the dashboard.
 */
export function normalizeHonorPersonName(value: unknown) {
  const compact = cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (compact === "tranquangdung" || compact === "quangdung") return "qudung";
  return compact;
}

function stableCode(value: unknown) {
  return cleanText(value).toUpperCase().replace(/\s+/g, "");
}

function dateKey(value: unknown) {
  const raw = cleanText(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vietnamese = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (!vietnamese) return null;
  return `${vietnamese[3]}-${vietnamese[2].padStart(2, "0")}-${vietnamese[1].padStart(2, "0")}`;
}

function personRows(db: JsonRecord) {
  const rows: StatePerson[] = [];
  for (const value of [...asRows(db.staff), ...asRows(db.accounts)]) {
    rows.push({
      id: cleanText(value.id),
      alternateId: cleanText(value.prId ?? value.pr_id),
      email: normalizeEmail(value.email),
      name: cleanText(value.ten ?? value.fullName ?? value.full_name ?? value.name),
    });
  }
  return rows;
}

function uniqueNameProfiles(profiles: HonorProfile[]) {
  const buckets = new Map<string, HonorProfile[]>();
  for (const profile of profiles) {
    const key = normalizeHonorPersonName(profile.fullName);
    if (key) buckets.set(key, [...(buckets.get(key) ?? []), profile]);
  }
  return new Map(
    [...buckets.entries()]
      .filter(([, matches]) => matches.length === 1)
      .map(([key, matches]) => [key, matches[0]]),
  );
}

function buildStatePersonMap(db: JsonRecord, profiles: HonorProfile[]) {
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const byEmail = new Map(
    profiles
      .filter((profile) => normalizeEmail(profile.email))
      .map((profile) => [normalizeEmail(profile.email), profile]),
  );
  const byName = uniqueNameProfiles(profiles);
  const stateIdToProfileId = new Map<string, string>();

  for (const person of personRows(db)) {
    const direct = byId.get(person.id) ?? byId.get(person.alternateId);
    const email = byEmail.get(person.email);
    const name = byName.get(normalizeHonorPersonName(person.name));
    const profile = direct ?? email ?? name;
    if (!profile) continue;
    if (person.id) stateIdToProfileId.set(person.id, profile.id);
    if (person.alternateId) stateIdToProfileId.set(person.alternateId, profile.id);
  }

  return (value: unknown) => {
    const raw = cleanText(value);
    if (!raw) return null;
    if (byId.has(raw)) return raw;
    const mappedId = stateIdToProfileId.get(raw);
    if (mappedId) return mappedId;
    return byName.get(normalizeHonorPersonName(raw))?.id ?? null;
  };
}

function sourceStatus(
  status: HonorSourceStatus["status"],
  reason: string,
  matchedRows = 0,
  skippedRows = 0,
  updatedAt: string | null = null,
): HonorSourceStatus {
  return { status, reason, matchedRows, skippedRows, updatedAt };
}

export function unavailableHonorSourceBundle(reason: string): HonorSourceBundle {
  return {
    externalMetrics: new Map(),
    sources: {
      b2CodeHd: sourceStatus("unavailable", reason),
      workScoreSheet: sourceStatus(
        "unavailable",
        "Sheet Điểm làm việc chỉ có Khóa/Tuần, chưa có ngày bắt đầu và kết thúc để đối chiếu đúng kỳ.",
      ),
    },
  };
}

/**
 * Build date-safe B1/B2 metrics from the dashboard's last synchronized state.
 * Contract rows without a matching, dated event are deliberately excluded.
 */
export function buildHonorExternalMetricsFromState(options: {
  state: unknown;
  profiles: HonorProfile[];
  period: HonorPeriod;
  stateUpdatedAt?: string | null;
}): HonorSourceBundle {
  const root = asRecord(options.state);
  const db = Object.keys(asRecord(root.DB ?? root.db)).length
    ? asRecord(root.DB ?? root.db)
    : root;
  const meta = asRecord(db.meta);
  const stateUpdatedAt = options.stateUpdatedAt ?? (cleanText(meta.updatedAt ?? meta.updated_at) || null);
  const sourceName = cleanText(meta.source);
  const sourceVersion = cleanText(db.contractSourceVersion ?? db.contract_source_version);
  const b2Rows = asRows(db.contractSourceB2 ?? db.contract_source_b2);
  const hasLiveProvenance = /google sheet/i.test(sourceName)
    || /^b2-code-owner-/i.test(sourceVersion);
  if (!hasLiveProvenance || !b2Rows.length) {
    return unavailableHonorSourceBundle(
      "Dashboard state chưa có nguồn B2 – Code HĐ đã đồng bộ và xác thực.",
    );
  }

  const resolveProfileId = buildStatePersonMap(db, options.profiles);
  const metrics = new Map<string, HonorExternalMetrics>(
    options.profiles.map((profile) => [profile.id, { eventCount: 0, signedEvents: 0 }]),
  );
  const b1Rows = asRows(db.contractSourceB1 ?? db.contract_source_b1);
  const b1Codes = new Set(b1Rows.map((row) => stableCode(row.ma ?? row.code)).filter(Boolean));
  const b2Codes = new Set(b2Rows.map((row) => stableCode(
    row.contractCode ?? row.contract_code ?? row.ma ?? row.code ?? row.contractId ?? row.contract_id,
  )).filter(Boolean));
  const signedRows = new Map<string, JsonRecord>();
  for (const row of b2Rows) {
    if (row.signed !== true) continue;
    const code = stableCode(
      row.contractCode ?? row.contract_code ?? row.ma ?? row.code ?? row.contractId ?? row.contract_id,
    );
    if (code && !signedRows.has(code)) signedRows.set(code, row);
  }

  const seenEvents = new Set<string>();
  const matchedSignedCodes = new Set<string>();
  let matchedRows = 0;
  let skippedRows = 0;
  for (const event of asRows(db.events)) {
    const code = stableCode(event.ma ?? event.code ?? event.contractCode ?? event.contract_code);
    const source = cleanText(event.source).toLowerCase();
    const relevant = source === "b1" || source === "b2" || b1Codes.has(code) || b2Codes.has(code);
    if (!relevant || !code || seenEvents.has(code)) continue;
    seenEvents.add(code);
    const eventDate = dateKey(event.taoNgay ?? event.createdDate ?? event.receivedDate ?? event.deadline);
    if (!eventDate || eventDate < options.period.start || eventDate > options.period.end) {
      skippedRows += 1;
      continue;
    }
    const contract = signedRows.get(code);
    const profileId = resolveProfileId(contract?.pr ?? contract?.ownerId ?? event.pr ?? event.ownerId);
    if (!profileId) {
      skippedRows += 1;
      continue;
    }
    const current = metrics.get(profileId) ?? { eventCount: 0, signedEvents: 0 };
    current.eventCount = Number(current.eventCount ?? 0) + 1;
    if (contract) {
      current.signedEvents = Number(current.signedEvents ?? 0) + 1;
      matchedSignedCodes.add(code);
    }
    metrics.set(profileId, current);
    matchedRows += 1;
  }

  const unmatchedSigned = [...signedRows.keys()].filter((code) => !matchedSignedCodes.has(code)).length;
  const reason = unmatchedSigned
    ? `Đã đối chiếu ${matchedSignedCodes.size} mã HĐ; bỏ ${unmatchedSigned} mã không ghép được với sự kiện có ngày trong kỳ.`
    : `Đã đối chiếu ${matchedSignedCodes.size} mã HĐ bằng mã sự kiện ổn định trong đúng kỳ.`;
  return {
    externalMetrics: metrics,
    sources: {
      b2CodeHd: sourceStatus(
        "available",
        reason,
        matchedRows,
        skippedRows + unmatchedSigned,
        stateUpdatedAt,
      ),
      workScoreSheet: sourceStatus(
        "unavailable",
        "Sheet Điểm làm việc chỉ có Khóa/Tuần, chưa có ngày bắt đầu và kết thúc để đối chiếu đúng kỳ.",
        0,
        0,
        stateUpdatedAt,
      ),
    },
  };
}

export async function loadDashboardHonorState(admin: SupabaseClient) {
  const [{ data: compressed, error: compressedError }, metaResult] = await Promise.all([
    admin.storage.from(STATE_BUCKET).download(COMPRESSED_STATE_FILE),
    admin.from("dashboard_state_meta").select("updated_at").eq("id", "main").maybeSingle(),
  ]);
  if (compressed && !compressedError) {
    const bytes = Buffer.from(await compressed.arrayBuffer());
    if (bytes.byteLength > MAX_COMPRESSED_STATE_BYTES) throw new Error("Dashboard state nén vượt quá giới hạn đọc.");
    const json = gunzipSync(bytes, { maxOutputLength: MAX_STATE_BYTES }).toString("utf8");
    return {
      state: JSON.parse(json) as unknown,
      updatedAt: cleanText(metaResult.data?.updated_at) || null,
    };
  }

  const { data: legacy, error: legacyError } = await admin.storage
    .from(STATE_BUCKET)
    .download(LEGACY_STATE_FILE);
  if (legacyError || !legacy) {
    throw compressedError ?? legacyError ?? new Error("Không tìm thấy dashboard state.");
  }
  if (legacy.size > MAX_STATE_BYTES) throw new Error("Dashboard state vượt quá giới hạn đọc.");
  return {
    state: JSON.parse(await legacy.text()) as unknown,
    updatedAt: cleanText(metaResult.data?.updated_at) || null,
  };
}
