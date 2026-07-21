import { NextResponse } from "next/server";
import { type AppRole, isAppRole, isProfileStatus } from "@/lib/authTypes";
import { ApiAuthError, getRequestIdentity, requireAnyRole } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

function cleanRoles(value: unknown): AppRole[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isAppRole))];
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await getRequestIdentity(request);
    requireAnyRole(identity.profile.roles, ["Admin", "PR Leader"]);
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const admin = getSupabaseAdmin();

    const [{ data: targetRolesRows }, { data: targetProfile, error: targetProfileError }] = await Promise.all([
      admin.from("user_roles").select("role").eq("user_id", id),
      admin.from("profiles").select("status").eq("id", id).single(),
    ]);
    if (targetProfileError || !targetProfile) throw new ApiAuthError("Không tìm thấy tài khoản.", 404);
    const targetRoles = (targetRolesRows ?? []).map((row) => row.role).filter(isAppRole);
    const isAdmin = identity.profile.roles.includes("Admin");
    if (!isAdmin && targetRoles.some((role) => role === "Admin" || role === "PR Leader")) {
      throw new ApiAuthError("PR Leader không được sửa tài khoản quản trị.", 403);
    }

    const roles = cleanRoles(body.roles);
    if (roles && !roles.length) throw new ApiAuthError("Tài khoản phải có ít nhất một vai trò.", 400);
    if (!isAdmin && roles?.some((role) => role === "Admin" || role === "PR Leader")) {
      throw new ApiAuthError("Chỉ Admin được cấp quyền quản trị.", 403);
    }
    if (id === identity.user.id && isProfileStatus(body.status) && body.status !== "active") {
      throw new ApiAuthError("Không thể tự khóa hoặc đưa tài khoản đang đăng nhập về trạng thái chờ duyệt.", 409);
    }
    if (targetRoles.includes("Admin") && roles && !roles.includes("Admin")) {
      const { count } = await admin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "Admin");
      if ((count ?? 0) <= 1) throw new ApiAuthError("Hệ thống phải còn ít nhất một Admin.", 409);
    }

    const password = typeof body.password === "string" ? body.password : "";
    if (password && !isAdmin) {
      throw new ApiAuthError("Chỉ Admin được thay đổi mật khẩu tài khoản.", 403);
    }
    if (password && password.length < 8) throw new ApiAuthError("Mật khẩu phải có ít nhất 8 ký tự.", 400);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.fullName === "string" && body.fullName.trim()) updates.full_name = body.fullName.trim();
    if (isProfileStatus(body.status)) updates.status = body.status;

    const { error: profileError } = await admin.from("profiles").update(updates).eq("id", id);
    if (profileError) throw profileError;

    if (roles) {
      await admin.from("user_roles").delete().eq("user_id", id);
      const { error: rolesError } = await admin.from("user_roles").insert(
        roles.map((role) => ({ user_id: id, role })),
      );
      if (rolesError) throw rolesError;
    }

    const authUpdate: Parameters<typeof admin.auth.admin.updateUserById>[1] = {};
    if (password) authUpdate.password = password;
    if (typeof body.fullName === "string" && body.fullName.trim()) authUpdate.user_metadata = { full_name: body.fullName.trim() };
    if (roles || isProfileStatus(body.status)) {
      authUpdate.app_metadata = {
        roles: roles ?? targetRoles,
        status: isProfileStatus(body.status) ? body.status : targetProfile.status,
      };
    }
    if (Object.keys(authUpdate).length) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, authUpdate);
      if (authError) throw authError;
    }

    return NextResponse.json({ updated: true });
  } catch (error) {
    return apiError(error, "Không thể cập nhật tài khoản.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await getRequestIdentity(request);
    requireAnyRole(identity.profile.roles, ["Admin"]);
    const { id } = await context.params;
    if (id === identity.user.id) throw new ApiAuthError("Không thể tự xóa tài khoản đang đăng nhập.", 409);

    const admin = getSupabaseAdmin();
    const { data: targetAdminRole } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", id)
      .eq("role", "Admin")
      .maybeSingle();
    if (targetAdminRole) {
      const { count } = await admin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "Admin");
      if ((count ?? 0) <= 1) throw new ApiAuthError("Hệ thống phải còn ít nhất một Admin.", 409);
    }

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error, "Không thể xóa tài khoản.");
  }
}
