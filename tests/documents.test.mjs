import assert from "node:assert/strict";
import test from "node:test";
import {
  documentCatalogCategory,
  documentIdentity,
  DocumentValidationError,
  legacyDocumentMutation,
  normalizeDocumentMutation,
  toDocumentDto,
} from "../lib/documents.ts";

test("normalizes link metadata and keeps unclassified documents recoverable", () => {
  const normalized = normalizeDocumentMutation({
    name: "  Quy trình tài trợ  ",
    documentType: "link",
    url: "https://docs.google.com/document/d/example",
    keywords: ["quy trình", "quy trình", "tài trợ"],
  });
  assert.equal(normalized.name, "Quy trình tài trợ");
  assert.equal(normalized.main_category, "Chưa phân loại");
  assert.equal(normalized.sub_category, "Chưa phân loại");
  assert.deepEqual(normalized.keywords, ["quy trình", "tài trợ"]);
  assert.equal(normalized.storage_path, null);
});

test("supports legacy document fields during dashboard migration", () => {
  const normalized = normalizeDocumentMutation({
    ten: "Tài liệu đào tạo",
    loai: "file",
    storagePath: "user-id/training.pdf",
    folder: "Đào tạo nhân sự",
  });
  assert.equal(normalized.name, "Tài liệu đào tạo");
  assert.equal(normalized.document_type, "file");
  assert.equal(normalized.sub_category, "Đào tạo nhân sự");
  assert.equal(normalized.url, null);
});

test("rejects unsafe external URLs and traversal storage paths", () => {
  assert.throws(
    () => normalizeDocumentMutation({ name: "X", documentType: "link", url: "javascript:alert(1)" }),
    DocumentValidationError,
  );
  assert.throws(
    () => normalizeDocumentMutation({ name: "X", documentType: "file", storagePath: "user/../secret.pdf" }),
    DocumentValidationError,
  );
});

test("file DTO never exposes a signed or public storage URL", () => {
  const dto = toDocumentDto({
    id: "00000000-0000-4000-8000-000000000001",
    name: "Tệp nội bộ",
    url: null,
    storage_path: "user/file.pdf",
    document_type: "file",
    main_category: "Tài liệu nội bộ",
    sub_category: "Cơ chế & nội quy",
    sort_order: 1,
    is_active: true,
    keywords: [],
    created_by: "00000000-0000-4000-8000-000000000002",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  });
  assert.equal(dto.storagePath, "user/file.pdf");
  assert.equal("url" in dto, false);
  assert.equal(dto.ten, "Tệp nội bộ");
  assert.equal(dto.createdBy, "00000000-0000-4000-8000-000000000002");
  assert.equal(dto.ng, "00000000-0000-4000-8000-000000000002");
});

test("catalog maps the required document names and keeps unknown names unclassified", () => {
  assert.deepEqual(documentCatalogCategory("Quy trình tài trợ sự kiện & KPI thời gian."), {
    mainCategory: "Tài liệu phục vụ tài trợ ColorME",
    subCategory: "Quy định",
  });
  assert.equal(documentCatalogCategory("Tài liệu chưa biết").mainCategory, "Chưa phân loại");
  const legacy = legacyDocumentMutation({
    id: "D1",
    ten: "Ban Đối Ngoại - NEU.",
    url: "https://docs.google.com/document/d/abc123/edit",
    folder: "Khác",
  });
  assert.equal(legacy.main_category, "Keeptrack đối tác dài hạn");
  assert.equal(legacy.legacy_metadata.legacyId, "D1");
});

test("document identity deduplicates Google document URL variants", () => {
  assert.equal(
    documentIdentity({ url: "https://docs.google.com/document/d/abc123/edit?usp=sharing" }),
    documentIdentity({ url: "https://docs.google.com/document/d/abc123/view" }),
  );
  assert.equal(documentIdentity({ storagePath: "user/file.pdf" }), "file:user/file.pdf");
});
