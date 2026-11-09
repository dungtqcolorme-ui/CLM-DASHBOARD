import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError } from "@/lib/marketing/domain";
import { inputId, inputKeys, inputObject, invalidInput } from "@/lib/marketing/input";
import { databaseError, marketingErrorResponse, marketingResponse, readBoundedJson } from "@/lib/marketing/server";

const pageSize = 100;

export async function GET(request: Request) {
  try {
    const { client, profile } = await getDashboardRequestIdentity(request);
    const params = new URL(request.url).searchParams;
    const keys = [...params.keys()];
    if (new Set(keys).size !== keys.length || keys.some((key) => key !== "campaign_id" && key !== "id")) invalidInput();

    let query = client.from("marketing_notifications")
      .select("id,team_id,campaign_id,content_id,content_version,subject,kind,created_at,read_at")
      .eq("recipient_id", profile.id);
    if (params.has("campaign_id")) query = query.eq("campaign_id", inputId(params.get("campaign_id")));
    if (params.has("id")) query = query.eq("id", inputId(params.get("id")));
    const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, pageSize);
    if (error) databaseError(error);
    const event = params.has("id") ? data[0] : undefined;
    let revision: { title: string; caption: string } | null = null;
    if (event?.content_id && event.content_version !== null) {
      const { data: row, error: revisionError } = await client.from("marketing_revisions")
        .select("snapshot")
        .eq("team_id", event.team_id)
        .eq("campaign_id", event.campaign_id)
        .eq("entity_type", "content")
        .eq("entity_id", event.content_id)
        .eq("version", event.content_version)
        .maybeSingle();
      if (revisionError) databaseError(revisionError);
      const snapshot = row?.snapshot;
      if (typeof snapshot?.title === "string" && typeof snapshot?.caption === "string") {
        revision = { title: snapshot.title, caption: snapshot.caption };
      }
    }
    return marketingResponse({ items: data.slice(0, pageSize), truncated: data.length > pageSize, revision });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client } = await getDashboardRequestIdentity(request);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) {
      throw new MarketingError("Nguồn yêu cầu không hợp lệ.", 403, "forbidden");
    }
    const body = inputObject(await readBoundedJson(request));
    inputKeys(body, ["id"]);
    const { data, error } = await client.rpc("marketing_mark_notification_read", { p_id: inputId(body.id) });
    if (error) databaseError(error);
    if (!data) throw new MarketingError("Thông báo không có trong phạm vi truy cập.", 404, "not_found");
    return marketingResponse({ result: { read_at: data } });
  } catch (error) {
    return marketingErrorResponse(error);
  }
}
