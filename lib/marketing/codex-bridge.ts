import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { MarketingError } from "@/lib/marketing/domain";
import { databaseError } from "@/lib/marketing/server";

export const codexJobId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function codexJob(client: SupabaseClient, action: "availability" | "enqueue" | "status", fields: {
  p_id?: string;
  p_prompt?: string;
} = {}) {
  const { data, error } = await client.rpc("marketing_codex_user_job", { p_action: action, ...fields });
  if (error?.code === "23505" && action === "enqueue") {
    throw new MarketingError("Bạn đã có một câu hỏi chờ xử lý. Hãy đợi câu trả lời rồi gửi tiếp.", 409, "codex_busy");
  }
  if (error?.code === "P0503") {
    throw new MarketingError("Cầu nối ColorME Marketing chưa được bật.", 503, "codex_unavailable");
  }
  if (error) databaseError(error);
  return data;
}
