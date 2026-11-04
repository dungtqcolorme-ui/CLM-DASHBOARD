import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError } from "@/lib/marketing/domain";
import { parseKnowledgeCommand } from "@/lib/marketing/knowledge-domain";
import { readKnowledgeWorkspace } from "@/lib/marketing/knowledge-server";
import { databaseError, marketingErrorResponse, marketingResponse, readBoundedJson } from "@/lib/marketing/server";

export async function GET(request: Request) {
  try {
    const { client } = await getDashboardRequestIdentity(request);
    return marketingResponse(await readKnowledgeWorkspace(client));
  } catch (error) { return marketingErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { client, profile } = await getDashboardRequestIdentity(request);
    if (!profile.roles.some((role) => ["Admin", "PR Leader", "PR Representative"].includes(role))) throw new MarketingError("Viewer chỉ có quyền xem.", 403, "forbidden");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new MarketingError("Nguồn yêu cầu không hợp lệ.", 403, "forbidden");
    const command = parseKnowledgeCommand(await readBoundedJson(request));
    if (["review_source", "review_fact"].includes(command.action) && !profile.roles.some((role) => role === "Admin" || role === "PR Leader")) throw new MarketingError("Review nguồn và dữ kiện cần PR Leader hoặc Admin.", 403, "forbidden");
    // The RPC repeats current identity, membership, evidence and scope-specific
    // DNA permissions inside the transaction. No generic tool/URL executor exists.
    const { data, error } = await client.rpc("marketing_knowledge_command", { p_command: command });
    if (error) databaseError(error);
    return marketingResponse({ result: data });
  } catch (error) { return marketingErrorResponse(error); }
}
