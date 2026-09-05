import "server-only";

import type { AppRole } from "@/lib/authTypes";
import { ApiAuthError } from "@/lib/serverAuth";

export const DOCUMENTS_BUCKET = process.env.CLM_DOCUMENTS_BUCKET || "clm-dashboard-uploads";

export function isDocumentManager(role: AppRole) {
  return role === "Admin" || role === "PR Leader";
}

export function canCreateDocument(role: AppRole) {
  return isDocumentManager(role) || role === "PR Representative";
}

export function requireDocumentCreate(role: AppRole) {
  if (!canCreateDocument(role)) {
    throw new ApiAuthError("Bạn không có quyền thêm tài liệu.", 403);
  }
}

export function requireDocumentUpdate(role: AppRole, ownerId: string, userId: string) {
  if (!isDocumentManager(role) && !(role === "PR Representative" && ownerId === userId)) {
    throw new ApiAuthError("Bạn không có quyền cập nhật tài liệu này.", 403);
  }
}

export function requireDocumentDelete(role: AppRole) {
  if (!isDocumentManager(role)) {
    throw new ApiAuthError("Chỉ Admin hoặc PR Leader được xóa tài liệu.", 403);
  }
}

export function requireDocumentStorageScope(
  role: AppRole,
  storagePath: string | null,
  userId: string,
) {
  if (!storagePath || isDocumentManager(role)) return;
  if (storagePath.split("/", 1)[0] !== userId) {
    throw new ApiAuthError("Bạn chỉ có thể thêm file trong thư mục Storage của mình.", 403);
  }
}
