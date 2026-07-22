import "server-only";

import type { User } from "@supabase/supabase-js";
import { type AppRole, type AuthProfile, isAppRole } from "@/lib/authTypes";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  status: AuthProfile["status"];
  created_at: string;
  updated_at: string;
};

export class ApiAuthError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

export function toAuthProfile(row: ProfileRow, roles: AppRole[]): AuthProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    roles,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getRequestIdentity(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new ApiAuthError("Thiếu phiên đăng nhập.");

  const admin = getSupabaseAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new ApiAuthError("Phiên đăng nhập không hợp lệ.");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email,full_name,status,created_at,updated_at")
    .eq("id", userData.user.id)
    .single<ProfileRow>();
  if (profileError || !profile) throw new ApiAuthError("Tài khoản chưa có hồ sơ hệ thống.", 403);

  const { data: roleRows, error: rolesError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (rolesError) throw new ApiAuthError("Không thể đọc quyền tài khoản.", 503);

  const roles = (roleRows ?? []).map((item) => item.role).filter(isAppRole);
  if (profile.status !== "active") {
    const message = profile.status === "pending"
      ? "Tài khoản đang chờ phê duyệt."
      : "Tài khoản đã bị khóa.";
    throw new ApiAuthError(message, 403);
  }
  if (!roles.length) throw new ApiAuthError("Tài khoản chưa được phân quyền.", 403);
  const requestedRole = request.headers.get("x-clm-active-role");
  const activeRole = requestedRole && isAppRole(requestedRole) && roles.includes(requestedRole)
    ? requestedRole
    : roles[0];

  return {
    token,
    user: userData.user as User,
    profile: toAuthProfile(profile, roles),
    activeRole,
  };
}

export function requireAnyRole(currentRoles: AppRole[], allowedRoles: AppRole[]) {
  if (!currentRoles.some((role) => allowedRoles.includes(role))) {
    throw new ApiAuthError("Bạn không có quyền thực hiện thao tác này.", 403);
  }
}
