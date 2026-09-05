export const UNCLASSIFIED_DOCUMENT_CATEGORY = "Chưa phân loại";
export const DOCUMENT_TYPES = ["link", "file"] as const;

export const DOCUMENT_CATALOG = [
  {
    mainCategory: "Tài liệu nội bộ",
    subCategory: "Cơ chế & nội quy",
    names: [
      "Team PR - Nội quy phòng Marketing.",
      "Cơ chế lương nhân sự phòng Marketing.",
      "Cơ chế thưởng KPI đầu vào & đầu ra.",
      "Cơ chế thưởng GIC.",
    ],
  },
  {
    mainCategory: "Tài liệu nội bộ",
    subCategory: "Đánh giá nhân sự",
    names: [
      "Đánh giá điểm làm việc (cơ chế review).",
      "Tuyển dụng và đào tạo trainee.",
      "Đào tạo nhân sự chính thức.",
      "Daily task nhân viên chính thức.",
      "Daily task trainee.",
    ],
  },
  {
    mainCategory: "Tài liệu phục vụ tài trợ ColorME",
    subCategory: "Chi phí hoạt động",
    names: ["Chi phí hoạt động team PR."],
  },
  {
    mainCategory: "Tài liệu phục vụ tài trợ ColorME",
    subCategory: "Ấn phẩm",
    names: ["Ấn phẩm Online & Offline.", "Tổng hợp content truyền thông.", "Order ấn phẩm Team Design."],
  },
  {
    mainCategory: "Tài liệu phục vụ tài trợ ColorME",
    subCategory: "Quy định",
    names: [
      "Quy chuẩn hình ảnh PR.",
      "Bảng keeptrack quyền lợi mẫu gửi đối tác.",
      "Quy trình tài trợ sự kiện & KPI thời gian.",
      "Điều khoản bất khả kháng.",
      "Bảng quy đổi quyền lợi online.",
    ],
  },
  {
    mainCategory: "Tài liệu phục vụ tài trợ ColorME",
    subCategory: "Định hướng seeding",
    names: ["Kịch bản seeding TikTok.", "Kịch bản seeding Fanpage.", "Quyền lợi Instagram."],
  },
  {
    mainCategory: "Keeptrack đối tác dài hạn",
    subCategory: "Keeptrack đối tác dài hạn",
    names: ["Ban Đối Ngoại - NEU.", "Kênh Thông Tin Sinh Viên - HANUTIMES."],
  },
  {
    mainCategory: "Page Partnership",
    subCategory: "Page Partnership",
    names: [
      "Plan phát triển Partnership.",
      "Quy trình quản lý Page Partnership.",
      "Khung content pillar.",
      "Đề xuất cơ chế khuyến khích truyền thông.",
    ],
  },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export type DocumentRow = {
  id: string;
  name: string;
  url: string | null;
  storage_path: string | null;
  document_type: DocumentType;
  main_category: string;
  sub_category: string;
  sort_order: number;
  is_active: boolean;
  keywords: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  legacy_metadata?: Record<string, unknown> | null;
};

export type DocumentDto = {
  id: string;
  name: string;
  url?: string;
  storagePath?: string;
  documentType: DocumentType;
  mainCategory: string;
  subCategory: string;
  sortOrder: number;
  isActive: boolean;
  keywords: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // Compatibility aliases for the existing HTML while it migrates to camelCase.
  ten: string;
  folder: string;
  loai: DocumentType;
  co: string;
  ng: string;
};

export type DocumentMutation = {
  name: string;
  url: string | null;
  storage_path: string | null;
  document_type: DocumentType;
  main_category: string;
  sub_category: string;
  sort_order: number;
  is_active: boolean;
  keywords: string[];
  legacy_metadata: Record<string, unknown>;
};

type JsonRecord = Record<string, unknown>;

export class DocumentValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function firstText(record: JsonRecord, keys: string[], max: number) {
  for (const key of keys) {
    const value = cleanText(record[key], max);
    if (value) return value;
  }
  return "";
}

function cleanExternalUrl(value: unknown) {
  const raw = cleanText(value, 4_000);
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DocumentValidationError("Link tài liệu không hợp lệ.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new DocumentValidationError("Link tài liệu chỉ hỗ trợ HTTP hoặc HTTPS.");
  }
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

export function cleanDocumentStoragePath(value: unknown) {
  const path = cleanText(value, 1_000);
  if (!path) return null;
  if (
    path.startsWith("/")
    || path.includes("\\")
    || path.includes("\0")
    || path.split("/").some((segment) => segment === "." || segment === ".." || !segment)
  ) {
    throw new DocumentValidationError("Đường dẫn file không hợp lệ.");
  }
  return path;
}

function cleanKeywords(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : cleanText(value, 2_000).split(",");
  return [...new Set(
    raw
      .map((item) => cleanText(item, 120))
      .filter(Boolean),
  )].slice(0, 30);
}

export function normalizeDocumentSearchText(value: unknown) {
  return cleanText(value, 2_000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function documentCatalogCategory(name: unknown, folder?: unknown) {
  const normalizedName = normalizeDocumentSearchText(name);
  const exact = DOCUMENT_CATALOG.find((group) => group.names.some(
    (catalogName) => normalizeDocumentSearchText(catalogName) === normalizedName,
  ));
  if (exact) return { mainCategory: exact.mainCategory, subCategory: exact.subCategory };
  const normalizedFolder = normalizeDocumentSearchText(folder);
  const byFolder = DOCUMENT_CATALOG.find((group) => (
    normalizeDocumentSearchText(group.mainCategory) === normalizedFolder
    || normalizeDocumentSearchText(group.subCategory) === normalizedFolder
  ));
  return byFolder
    ? { mainCategory: byFolder.mainCategory, subCategory: byFolder.subCategory }
    : { mainCategory: UNCLASSIFIED_DOCUMENT_CATEGORY, subCategory: UNCLASSIFIED_DOCUMENT_CATEGORY };
}

export function legacyDocumentMutation(value: unknown) {
  const record = asRecord(value);
  const name = firstText(record, ["name", "ten", "title"], 300);
  const folder = firstText(record, ["folder", "subCategory", "sub_category"], 200);
  const category = documentCatalogCategory(name, folder);
  const storagePath = firstText(record, ["storagePath", "storage_path", "filePath", "file_path"], 1_000);
  const mutation = normalizeDocumentMutation({
    name,
    url: storagePath ? null : record.url ?? record.link,
    storagePath: storagePath || null,
    documentType: storagePath ? "file" : "link",
    mainCategory: category.mainCategory,
    subCategory: category.subCategory,
    sortOrder: record.sortOrder ?? record.sort_order ?? 0,
    isActive: record.isActive ?? record.is_active ?? true,
    keywords: record.keywords ?? [],
    legacyMetadata: {
      source: "dashboard-state",
      legacyId: cleanText(record.id, 200),
      originalFolder: folder,
      originalType: cleanText(record.loai ?? record.documentType ?? record.document_type, 100),
    },
  });
  return mutation;
}

export function documentIdentity(value: {
  url?: string | null;
  storage_path?: string | null;
  storagePath?: string | null;
}) {
  const path = cleanDocumentStoragePath(value.storage_path ?? value.storagePath);
  if (path) return `file:${path}`;
  const url = cleanExternalUrl(value.url);
  if (!url) return null;
  const parsed = new URL(url);
  const googlePathId = parsed.pathname.match(/\/d\/([^/]+)/)?.[1] || parsed.searchParams.get("id");
  if (googlePathId && /(^|\.)google\.com$/i.test(parsed.hostname)) {
    return `google:${parsed.hostname.toLowerCase()}:${googlePathId}`;
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.searchParams.sort();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return `link:${parsed.toString()}`;
}

function documentType(value: unknown, url: string | null, storagePath: string | null): DocumentType {
  const normalized = cleanText(value, 20).toLowerCase();
  if (normalized === "file" || normalized === "upload" || normalized === "tệp") return "file";
  if (normalized === "link" || normalized === "url") return "link";
  return storagePath && !url ? "file" : "link";
}

function cleanSortOrder(value: unknown, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(-10_000, Math.min(10_000, Math.trunc(number)));
}

function legacyMetadata(record: JsonRecord, current?: DocumentRow) {
  const supplied = asRecord(record.legacyMetadata ?? record.legacy_metadata);
  const previous = asRecord(current?.legacy_metadata);
  return { ...previous, ...supplied };
}

export function normalizeDocumentMutation(
  value: unknown,
  current?: DocumentRow,
): DocumentMutation {
  const record = asRecord(value);
  const name = firstText(record, ["name", "ten", "title"], 300) || current?.name || "";
  if (!name) throw new DocumentValidationError("Vui lòng nhập tên tài liệu.");

  const hasUrl = Object.hasOwn(record, "url") || Object.hasOwn(record, "link");
  const hasStoragePath = Object.hasOwn(record, "storagePath") || Object.hasOwn(record, "storage_path");
  const url = hasUrl
    ? cleanExternalUrl(record.url ?? record.link)
    : current?.url ?? null;
  const storagePath = hasStoragePath
    ? cleanDocumentStoragePath(record.storagePath ?? record.storage_path)
    : current?.storage_path ?? null;
  const type = documentType(
    record.documentType ?? record.document_type ?? record.loai ?? current?.document_type,
    url,
    storagePath,
  );

  if (type === "link" && !url) {
    throw new DocumentValidationError("Tài liệu dạng link phải có URL.");
  }
  if (type === "file" && !storagePath) {
    throw new DocumentValidationError("Tài liệu dạng file phải có đường dẫn Storage.");
  }

  const mainCategory = firstText(record, ["mainCategory", "main_category"], 200)
    || current?.main_category
    || UNCLASSIFIED_DOCUMENT_CATEGORY;
  const subCategory = firstText(record, ["subCategory", "sub_category", "folder"], 200)
    || current?.sub_category
    || UNCLASSIFIED_DOCUMENT_CATEGORY;
  const hasActive = Object.hasOwn(record, "isActive") || Object.hasOwn(record, "is_active");
  const isActive = hasActive
    ? (record.isActive ?? record.is_active) !== false
    : current?.is_active ?? true;

  return {
    name,
    url: type === "link" ? url : null,
    storage_path: type === "file" ? storagePath : null,
    document_type: type,
    main_category: mainCategory,
    sub_category: subCategory,
    sort_order: cleanSortOrder(
      record.sortOrder ?? record.sort_order,
      current?.sort_order ?? 0,
    ),
    is_active: isActive,
    keywords: Object.hasOwn(record, "keywords")
      ? cleanKeywords(record.keywords)
      : current?.keywords ?? [],
    legacy_metadata: legacyMetadata(record, current),
  };
}

export function toDocumentDto(row: DocumentRow): DocumentDto {
  const dto: DocumentDto = {
    id: row.id,
    name: row.name,
    documentType: row.document_type,
    mainCategory: row.main_category || UNCLASSIFIED_DOCUMENT_CATEGORY,
    subCategory: row.sub_category || UNCLASSIFIED_DOCUMENT_CATEGORY,
    sortOrder: Number(row.sort_order) || 0,
    isActive: row.is_active,
    keywords: Array.isArray(row.keywords) ? row.keywords.filter(Boolean) : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    ten: row.name,
    folder: row.sub_category || row.main_category || UNCLASSIFIED_DOCUMENT_CATEGORY,
    loai: row.document_type,
    co: row.updated_at,
    ng: row.created_by,
  };
  if (row.document_type === "link" && row.url) dto.url = row.url;
  if (row.document_type === "file" && row.storage_path) dto.storagePath = row.storage_path;
  return dto;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
