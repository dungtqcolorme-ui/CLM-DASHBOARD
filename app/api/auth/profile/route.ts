import { NextResponse } from "next/server";
import { ApiAuthError, getRequestIdentity } from "@/lib/serverAuth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  try {
    const { profile } = await getRequestIdentity(request);
    let avatarUrl = "";
    if (profile.avatarPath) {
      const { data } = await getSupabaseAdmin().storage
        .from("clm-profile-avatars")
        .createSignedUrl(profile.avatarPath, 60 * 60);
      avatarUrl = data?.signedUrl ?? "";
    }
    return NextResponse.json({ profile: { ...profile, avatarUrl } });
  } catch (error) {
    const status = error instanceof ApiAuthError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Không thể đọc hồ sơ tài khoản.";
    return NextResponse.json({ error: message }, { status });
  }
}
