import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { codexBridgeConfig, codexJob, codexJobId } from "@/lib/marketing/codex-bridge";
import { MarketingError } from "@/lib/marketing/domain";
import { marketingErrorResponse, marketingResponse, readBoundedJson } from "@/lib/marketing/server";

async function authorizedOwner(request: Request) {
  const { profile } = await getDashboardRequestIdentity(request);
  const config = codexBridgeConfig();
  if (!config || config.owner !== profile.id || !profile.roles.includes("Admin")) {
    throw new MarketingError("Cầu nối ColorME Marketing chưa mở cho tài khoản này.", 403, "codex_unavailable");
  }
  return profile.id;
}

export async function GET(request: Request) {
  try {
    const owner = await authorizedOwner(request);
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!codexJobId.test(id)) throw new MarketingError("Mã câu hỏi không hợp lệ.");
    const job = await codexJob("status", owner, { p_id: id });
    if (!job) throw new MarketingError("Không tìm thấy câu hỏi.", 404, "codex_job_not_found");
    return marketingResponse(job);
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await authorizedOwner(request);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      throw new MarketingError("Nguồn yêu cầu không hợp lệ.", 403, "forbidden");
    }
    const body = await readBoundedJson(request);
    const message = body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message.trim() : "";
    if (!message || message.length > 1200) throw new MarketingError("Câu hỏi phải có từ 1 đến 1.200 ký tự.");
    const id = body && typeof body === "object" && "id" in body && typeof body.id === "string" ? body.id : "";
    if (!codexJobId.test(id)) throw new MarketingError("Mã câu hỏi không hợp lệ.");
    return marketingResponse(await codexJob("enqueue", owner, { p_id: id, p_prompt: message }), 202);
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
