import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { AuthProfile } from "@/lib/authTypes";
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

type ProfileOverrides = Partial<Pick<
  AuthProfile,
  "fullName" | "updatedAt" | "dateOfBirth" | "phone" | "avatarPath"
>>;

async function accountProfile(profile: AuthProfile, overrides: ProfileOverrides = {}) {
  const nextProfile = { ...profile, ...overrides };
  const avatarPath = nextProfile.avatarPath ?? "";
  return {
    ...nextProfile,
    avatarPath,
    avatarUrl: await signedAvatarUrl(avatarPath),
  };
}

export async function GET(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    return NextResponse.json({ profile: await accountProfile(identity.profile) });
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
    const { data: updatedProfile, error } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        phone,
        date_of_birth: dateOfBirth,
      })
      .eq("id", identity.user.id)
      .select("updated_at")
      .single<{ updated_at: string }>();
    if (error || !updatedProfile) throw error ?? new Error("Không thể đọc hồ sơ vừa cập nhật.");
    const { error: authError } = await admin.auth.admin.updateUserById(identity.user.id, {
      user_metadata: {
        ...(identity.user.user_metadata ?? {}),
        full_name: fullName,
      },
    });
    if (authError) throw authError;
    return NextResponse.json({
      updated: true,
      profile: await accountProfile(identity.profile, {
        fullName,
        phone,
        dateOfBirth,
        updatedAt: updatedProfile.updated_at,
      }),
    });
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
    const oldAvatarPath = identity.profile.avatarPath ?? "";
    const path = `${identity.user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(
      path,
      await file.arrayBuffer(),
      { contentType: file.type, upsert: false, cacheControl: "3600" },
    );
    if (uploadError) throw uploadError;
    const { data: updatedProfile, error: profileError } = await admin
      .from("profiles")
      .update({ avatar_path: path })
      .eq("id", identity.user.id)
      .select("updated_at")
      .single<{ updated_at: string }>();
    if (profileError || !updatedProfile) {
      await admin.storage.from(AVATAR_BUCKET).remove([path]);
      throw profileError ?? new Error("Không thể đọc hồ sơ vừa cập nhật.");
    }
    if (oldAvatarPath && oldAvatarPath !== path) {
      await admin.storage.from(AVATAR_BUCKET).remove([oldAvatarPath]);
    }
    return NextResponse.json({
      uploaded: true,
      profile: await accountProfile(identity.profile, {
        avatarPath: path,
        updatedAt: updatedProfile.updated_at,
      }),
    });
  } catch (error) {
    return apiError(error, "Không thể tải ảnh đại diện.");
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await getRequestIdentity(request);
    const admin = getSupabaseAdmin();
    const avatarPath = identity.profile.avatarPath ?? "";
    if (avatarPath) await admin.storage.from(AVATAR_BUCKET).remove([avatarPath]);
    const { data: updatedProfile, error: updateError } = await admin
      .from("profiles")
      .update({ avatar_path: "" })
      .eq("id", identity.user.id)
      .select("updated_at")
      .single<{ updated_at: string }>();
    if (updateError || !updatedProfile) throw updateError ?? new Error("Không thể đọc hồ sơ vừa cập nhật.");
    return NextResponse.json({
      deleted: true,
      profile: await accountProfile(identity.profile, {
        avatarPath: "",
        updatedAt: updatedProfile.updated_at,
      }),
    });
  } catch (error) {
    return apiError(error, "Không thể xóa ảnh đại diện.");
  }
}
