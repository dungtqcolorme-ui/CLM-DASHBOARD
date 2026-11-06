import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError, parseMarketingCommand } from "@/lib/marketing/domain";
import { databaseError, MARKETING_CAPABILITIES, marketingErrorResponse, marketingResponse, readBoundedJson, readMarketingRows } from "@/lib/marketing/server";

export async function GET(request: Request) {
  try {
    const { client, profile } = await getDashboardRequestIdentity(request);
    const [teams, memberships, campaigns, contentItems, revisions] = await Promise.all([
      readMarketingRows(client, "marketing_teams", "id,name,creator_id,created_at", 100),
      readMarketingRows(client, "marketing_team_memberships", "team_id,user_id,created_at", 1000),
      readMarketingRows(client, "marketing_campaigns", "*", 500),
      readMarketingRows(client, "marketing_content_items", "*", 2000),
      readMarketingRows(client, "marketing_revisions", "id,team_id,campaign_id,entity_type,entity_id,version,action,actor_id,snapshot,created_at", 5000),
    ]);
    return marketingResponse({ profile, teams, memberships, campaigns, contentItems, revisions, capabilities: MARKETING_CAPABILITIES });
  } catch (error) { return marketingErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { client, profile } = await getDashboardRequestIdentity(request);
    // The selected-role header is a display preference, not proof of permission.
    if (!profile.roles.some((role) => ["Admin", "PR Leader", "PR Representative"].includes(role))) throw new MarketingError("Viewer chỉ có quyền xem.", 403, "forbidden");
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new MarketingError("Nguồn yêu cầu không hợp lệ.", 403, "forbidden");
    const command = parseMarketingCommand(await readBoundedJson(request));
    if (["create_team", "set_member"].includes(command.action) && !profile.roles.includes("Admin")) throw new MarketingError("Chỉ Admin có thể quản lý team Marketing.", 403, "forbidden");
    if (["activate_campaign", "pause_campaign", "resume_campaign", "complete_campaign", "archive_campaign", "request_changes", "confirm_kpi_revision"].includes(command.action) && !profile.roles.some((role) => role === "Admin" || role === "PR Leader")) throw new MarketingError("Thao tác này cần PR Leader hoặc Admin.", 403, "forbidden");
    // A user-JWT transaction repeats all authorization and version checks at the data boundary.
    const rpc = command.action === "propose_kpi_revision" || command.action === "confirm_kpi_revision"
      ? "marketing_campaign_kpi_command" : "marketing_command";
    const { data, error } = await client.rpc(rpc, { p_command: command });
    if (error) databaseError(error);
    return marketingResponse({ result: data });
  } catch (error) { return marketingErrorResponse(error); }
}
