import "server-only";

import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { MarketingError } from "@/lib/marketing/domain";
import { databaseError } from "@/lib/marketing/server";

export const codexJobId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function codexBridgeConfig() {
  const owner = process.env.CLM_CODEX_OWNER_ID?.trim();
  const token = process.env.CLM_CODEX_BRIDGE_TOKEN?.trim();
  return owner && codexJobId.test(owner) && token && /^[0-9a-f]{64}$/i.test(token)
    ? { owner, token } : null;
}

export function bridgeAuthorized(request: Request, token: string) {
  const expected = Buffer.from(`Bearer ${token}`);
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function codexJob(action: "enqueue" | "status" | "claim" | "complete", owner: string, fields: {
  p_id?: string;
  p_prompt?: string;
  p_lease?: string;
  p_answer?: string | null;
} = {}) {
  const { data, error } = await getSupabaseAdmin().rpc("marketing_codex_job", {
    p_action: action, p_owner: owner, ...fields,
  });
  if (error?.code === "23505" && action === "enqueue") {
    throw new MarketingError("ColorME Marketing đang có một câu hỏi chờ xử lý. Hãy đợi câu trả lời rồi gửi tiếp.", 409, "codex_busy");
  }
  if (error) databaseError(error);
  return data;
}
