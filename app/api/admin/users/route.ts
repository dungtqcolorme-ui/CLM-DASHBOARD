import { NextResponse } from "next/server";
import {
  APP_ROLES,
  type AppRole,
  type AuthProfile,
  isAppRole,
  isProfileStatus,
} from "@/lib/authTypes";
import {
  ApiAuthError,
  getRequestIdentity,
  requireAnyRole,
  toAuthProfile,
} from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  status: AuthProfile["status"];
  created_at: string;
  updated_at: string;
};

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

function cleanRoles(value: unknown): AppRole[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isAppRole))];
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    requireAnyRole([identity.activeRole], ["Admin", "PR Leader"]);
    const admin = getSupabaseAdmin();

    const [
      { data: profiles, error: profilesError },
      { data: roleRows, error: rolesError },
      { data: authUsers, error: authUsersError },
    ] = await Promise.all([
      admin.from("profiles").select("id,email,full_name,status,created_at,updated_at").order("created_at"),
      admin.from("user_roles").select("user_id,role"),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (profilesError || rolesError || authUsersError) {
      throw profilesError ?? rolesError ?? authUsersError;
    }

    const rolesByUser = new Map<string, AppRole[]>();
    for (const row of roleRows ?? []) {
      if (!isAppRole(row.role)) continue;
      const roles = rolesByUser.get(row.user_id) ?? [];
      roles.push(row.role);
      rolesByUser.set(row.user_id, roles);
    }

    const lastSignInByUser = new Map(
      (authUsers?.users ?? []).map((user) => [user.id, user.last_sign_in_at ?? null]),
    );
    const users = (profiles as ProfileRow[] ?? []).map((profile) => ({
      ...toAuthProfile(profile, rolesByUser.get(profile.id) ?? []),
      lastSignInAt: lastSignInByUser.get(profile.id) ?? null,
    }));
    return NextResponse.json({ users });
  } catch (error) {
    return apiError(error, "Không thể tải danh sách tài khoản.");
  }
}

export async function POST(request: Request) {
  let createdUserId = "";
  try {
    const identity = await getRequestIdentity(request);
    requireAnyRole([identity.activeRole], ["Admin", "PR Leader"]);

    const body = await request.json() as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "").trim();
    const roles = cleanRoles(body.roles);
    const status = isProfileStatus(body.status) ? body.status : "active";

    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiAuthError("Email không hợp lệ.", 400);
    if (password.length < 8) throw new ApiAuthError("Mật khẩu phải có ít nhất 8 ký tự.", 400);
    if (!fullName) throw new ApiAuthError("Vui lòng nhập họ tên.", 400);
    if (!roles.length) throw new ApiAuthError("Vui lòng chọn ít nhất một vai trò.", 400);
    if (roles.some((role) => !APP_ROLES.includes(role))) throw new ApiAuthError("Vai trò không hợp lệ.", 400);
    if (identity.activeRole !== "Admin" && roles.some((role) => role === "Admin" || role === "PR Leader")) {
      throw new ApiAuthError("Chỉ Admin được tạo tài khoản quản trị hoặc PR Leader.", 403);
    }

    const admin = getSupabaseAdmin();
    const { data: authData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { roles, status },
    });
    if (createError || !authData.user) {
      const conflict = /already|registered|exists/i.test(createError?.message ?? "");
      throw new ApiAuthError(conflict ? "Email này đã tồn tại trên Supabase Auth." : (createError?.message ?? "Không thể tạo tài khoản."), conflict ? 409 : 400);
    }
    createdUserId = authData.user.id;

    const now = new Date().toISOString();
    const { error: profileError } = await admin.from("profiles").upsert({
      id: createdUserId,
      email,
      full_name: fullName,
      status,
      updated_at: now,
    });
    if (profileError) throw profileError;

    await admin.from("user_roles").delete().eq("user_id", createdUserId);
    const { error: rolesError } = await admin.from("user_roles").insert(
      roles.map((role) => ({ user_id: createdUserId, role })),
    );
    if (rolesError) throw rolesError;

    const { data: profile } = await admin
      .from("profiles")
      .select("id,email,full_name,status,created_at,updated_at")
      .eq("id", createdUserId)
      .single<ProfileRow>();
    return NextResponse.json({ user: profile ? toAuthProfile(profile, roles) : null }, { status: 201 });
  } catch (error) {
    if (createdUserId) {
      await getSupabaseAdmin().auth.admin.deleteUser(createdUserId).catch(() => undefined);
    }
    return apiError(error, "Không thể tạo tài khoản.");
  }
}
