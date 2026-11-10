import { bridgeAuthorized, codexBridgeConfig, codexJob, codexJobId } from "@/lib/marketing/codex-bridge";
import { MarketingError } from "@/lib/marketing/domain";
import { marketingErrorResponse, marketingResponse, readBoundedJson } from "@/lib/marketing/server";

export async function POST(request: Request) {
  try {
    const config = codexBridgeConfig();
    if (!config || !bridgeAuthorized(request, config.token)) {
      throw new MarketingError("Cầu nối chưa được xác thực.", 401, "unauthorized");
    }
    const body = await readBoundedJson(request);
    if (!body || typeof body !== "object" || !("action" in body)) throw new MarketingError("Lệnh không hợp lệ.");
    if (body.action === "claim") return marketingResponse(await codexJob("claim", config.owner));
    if (body.action === "complete" && "id" in body && "lease" in body && "answer" in body
      && typeof body.id === "string" && codexJobId.test(body.id)
      && typeof body.lease === "string" && codexJobId.test(body.lease)
      && (body.answer === null || (typeof body.answer === "string" && body.answer.trim().length > 0 && body.answer.length <= 10000))) {
      return marketingResponse(await codexJob("complete", config.owner, {
        p_id: body.id, p_lease: body.lease, p_answer: body.answer,
      }));
    }
    throw new MarketingError("Lệnh không hợp lệ.");
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
