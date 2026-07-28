import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  type AppRole,
  type AuthProfile,
  isAppRole,
} from "@/lib/authTypes";
import { ApiAuthError, toAuthProfile } from "@/lib/serverAuth";

export const DASHBOARD_TOKEN_COOKIE = "clm-dashboard-access";
export const DASHBOARD_ROLE_COOKIE = "clm-dashboard-role";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  status: AuthProfile["status"];
  created_at: string;
  updated_at: string;
};

function createUserClient(token: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Thiếu cấu hình Supabase công khai.");
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getDashboardIdentity(token: string, requestedRole = "") {
  if (!token) throw new ApiAuthError("Thiếu phiên đăng nhập.");
  const client = createUserClient(token);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new ApiAuthError("Phiên đăng nhập không hợp lệ.");

  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    client
      .from("profiles")
      .select("id,email,full_name,status,created_at,updated_at")
      .eq("id", userData.user.id)
      .single<ProfileRow>(),
    client.from("user_roles").select("role").eq("user_id", userData.user.id),
  ]);
  if (profileError || !profile) throw new ApiAuthError("Tài khoản chưa có hồ sơ hệ thống.", 403);
  if (rolesError) throw new ApiAuthError("Không thể đọc quyền tài khoản.", 503);

  const roles = (roleRows ?? []).map((item) => item.role).filter(isAppRole);
  if (profile.status !== "active") {
    throw new ApiAuthError(profile.status === "pending" ? "Tài khoản đang chờ phê duyệt." : "Tài khoản đã bị khóa.", 403);
  }
  if (!roles.length) throw new ApiAuthError("Tài khoản chưa được phân quyền.", 403);
  const activeRole: AppRole = isAppRole(requestedRole) && roles.includes(requestedRole)
    ? requestedRole
    : roles[0];
  return {
    token,
    client,
    profile: toAuthProfile(profile, roles),
    activeRole,
  };
}

export async function getDashboardRequestIdentity(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return getDashboardIdentity(token, request.headers.get("x-clm-active-role") ?? "");
}

export async function getDashboardSessionIdentity() {
  const cookieStore = await cookies();
  const token = cookieStore.get(DASHBOARD_TOKEN_COOKIE)?.value ?? "";
  const activeRole = cookieStore.get(DASHBOARD_ROLE_COOKIE)?.value ?? "";
  return getDashboardIdentity(token, activeRole);
}
