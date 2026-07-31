import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const AVATAR_BUCKET = "clm-profile-avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function apiError(error: unknown, fallback: string) {
  const status = error instanceof ApiAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

async function signedAvatarUrl(path: string) {
  if (!path) return "";
  const { data, error } = await getSupabaseAdmin().storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return "";
  return data.signedUrl;
}

async function accountProfile(userId: string) {
  const admin = getSupabaseAdmin();
  const [{ data: profile, error }, { data: roleRows, error: rolesError }] = await Promise.all([
    admin
      .from("profiles")
      .select("id,email,full_name,status,created_at,updated_at,date_of_birth,phone,avatar_path")
      .eq("id", userId)
      .single(),
    admin.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (error || !profile) throw error ?? new ApiAuthError("Không tìm thấy hồ sơ.", 404);
  if (rolesError) throw rolesError;
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    status: profile.status,
    roles: (roleRows ?? []).map((row) => row.role),
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
    dateOfBirth: profile.date_of_birth,
    phone: profile.phone,
    avatarPath: profile.avatar_path,
    avatarUrl: await signedAvatarUrl(profile.avatar_path),
  };
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    return NextResponse.json({ profile: await accountProfile(identity.user.id) });
  } catch (error) {
    return apiError(error, "Không thể tải hồ sơ cá nhân.");
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const fullName = String(body.fullName ?? "").trim().slice(0, 120);
    const phone = String(body.phone ?? "").trim().slice(0, 30);
    const dateOfBirth = body.dateOfBirth == null || body.dateOfBirth === ""
      ? null
      : String(body.dateOfBirth);
    if (!fullName) throw new ApiAuthError("Vui lòng nhập họ tên.", 400);
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      throw new ApiAuthError("Ngày sinh không hợp lệ.", 400);
    }
    if (phone && !/^[+\d][\d\s().-]{7,29}$/.test(phone)) {
      throw new ApiAuthError("Số điện thoại không hợp lệ.", 400);
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin.from("profiles").update({
      full_name: fullName,
      phone,
      date_of_birth: dateOfBirth,
    }).eq("id", identity.user.id);
    if (error) throw error;
    const { error: authError } = await admin.auth.admin.updateUserById(identity.user.id, {
      user_metadata: {
        ...(identity.user.user_metadata ?? {}),
        full_name: fullName,
      },
    });
    if (authError) throw authError;
    return NextResponse.json({ updated: true, profile: await accountProfile(identity.user.id) });
  } catch (error) {
    return apiError(error, "Không thể cập nhật hồ sơ.");
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "change-password") {
      throw new ApiAuthError("Thao tác không hợp lệ.", 400);
    }
    const currentPassword = String(body.currentPassword ?? "");
    const newPassword = String(body.newPassword ?? "");
    if (!currentPassword) throw new ApiAuthError("Vui lòng nhập mật khẩu hiện tại.", 400);
    if (newPassword.length < 8) throw new ApiAuthError("Mật khẩu mới phải có ít nhất 8 ký tự.", 400);
    if (currentPassword === newPassword) throw new ApiAuthError("Mật khẩu mới phải khác mật khẩu hiện tại.", 400);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) throw new Error("Thiếu cấu hình Supabase Auth.");
    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error: signInError } = await verifier.auth.signInWithPassword({
      email: identity.profile.email,
      password: currentPassword,
    });
    if (signInError || data.user?.id !== identity.user.id) {
      throw new ApiAuthError("Mật khẩu hiện tại không đúng.", 400);
    }
    const { error: updateError } = await verifier.auth.updateUser({ password: newPassword });
    await verifier.auth.signOut().catch(() => undefined);
    if (updateError) throw updateError;
    return NextResponse.json({ updated: true });
  } catch (error) {
    return apiError(error, "Không thể đổi mật khẩu.");
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiAuthError("Vui lòng chọn ảnh đại diện.", 400);
    const extension = AVATAR_TYPES.get(file.type);
    if (!extension) throw new ApiAuthError("Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.", 400);
    if (!file.size || file.size > MAX_AVATAR_BYTES) throw new ApiAuthError("Ảnh đại diện phải nhỏ hơn 5 MB.", 400);

    const admin = getSupabaseAdmin();
    const { data: oldProfile } = await admin
      .from("profiles")
      .select("avatar_path")
      .eq("id", identity.user.id)
      .single<{ avatar_path: string }>();
    const path = `${identity.user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(
      path,
      await file.arrayBuffer(),
      { contentType: file.type, upsert: false, cacheControl: "3600" },
    );
    if (uploadError) throw uploadError;
    const { error: profileError } = await admin
      .from("profiles")
      .update({ avatar_path: path })
      .eq("id", identity.user.id);
    if (profileError) {
      await admin.storage.from(AVATAR_BUCKET).remove([path]);
      throw profileError;
    }
    if (oldProfile?.avatar_path && oldProfile.avatar_path !== path) {
      await admin.storage.from(AVATAR_BUCKET).remove([oldProfile.avatar_path]);
    }
    return NextResponse.json({ uploaded: true, profile: await accountProfile(identity.user.id) });
  } catch (error) {
    return apiError(error, "Không thể tải ảnh đại diện.");
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const admin = getSupabaseAdmin();
    const { data: profile, error } = await admin
      .from("profiles")
      .select("avatar_path")
      .eq("id", identity.user.id)
      .single<{ avatar_path: string }>();
    if (error) throw error;
    if (profile.avatar_path) await admin.storage.from(AVATAR_BUCKET).remove([profile.avatar_path]);
    const { error: updateError } = await admin
      .from("profiles")
      .update({ avatar_path: "" })
      .eq("id", identity.user.id);
    if (updateError) throw updateError;
    return NextResponse.json({ deleted: true, profile: await accountProfile(identity.user.id) });
  } catch (error) {
    return apiError(error, "Không thể xóa ảnh đại diện.");
  }
}
