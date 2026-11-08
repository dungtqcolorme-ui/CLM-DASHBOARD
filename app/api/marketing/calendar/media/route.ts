import type { SupabaseClient } from "@supabase/supabase-js";
import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { calendarFinalMedia, projectCalendarEvidence, type CalendarApprovalRow, type CalendarJobRow } from "@/lib/marketing/calendar-domain";
import { CREATIVE_BUCKET, matchesCreativeBytes, readCreativeAsset } from "@/lib/marketing/creative-server";
import { inspectCreativeImage } from "@/lib/marketing/creative-image";
import type { CreativeAsset } from "@/lib/marketing/creative-types";
import { MarketingError } from "@/lib/marketing/domain";
import { inputId, invalidInput } from "@/lib/marketing/input";
import type { MediaAttestation } from "@/lib/marketing/publishing-types";
import { databaseError, marketingErrorResponse } from "@/lib/marketing/server";

function unavailable(): never { throw new MarketingError("Ảnh trong bản duyệt không còn khả dụng. Kiểm tra quyền hoặc bản duyệt hiện tại.", 403, "asset_unavailable"); }

async function readBinding(client: SupabaseClient, jobId: string, assetId: string) {
  const { data: job, error } = await client.from("marketing_publishing_jobs")
    .select("id,team_id,campaign_id,content_id,candidate_id,approval_id,connection_id,status,scheduled_for,remote_id,receipt,created_at")
    .eq("id", jobId).maybeSingle();
  if (error) databaseError(error);
  if (!job || job.status === "cancelled") unavailable();
  const { data: approval, error: approvalError } = await client.from("marketing_approval_snapshots")
    .select("id,team_id,content_id,approver_id,content_version,snapshot,created_at").eq("id", job.approval_id).maybeSingle();
  if (approvalError) databaseError(approvalError);
  if (!approval || !projectCalendarEvidence([job as CalendarJobRow], [approval as CalendarApprovalRow], []).publications[0].approval) unavailable();
  const media = calendarFinalMedia(approval.snapshot).find((row) => row.asset_id === assetId);
  if (!media) unavailable();
  return { job: job as CalendarJobRow, media };
}
function checkAsset(asset: CreativeAsset, job: CalendarJobRow, media: MediaAttestation) {
  if (asset.status !== "ready" || asset.rights !== "approved" || !asset.allowed_channels.includes("facebook")
    || asset.team_id !== job.team_id || (asset.campaign_id !== null && asset.campaign_id !== job.campaign_id)
    || asset.version !== media.asset_version || asset.byte_size !== media.byte_size || asset.reported_sha256 !== media.sha256) unavailable();
}

export async function GET(request: Request) {
  try {
    const { client } = await getDashboardRequestIdentity(request);
    const query = [...new URL(request.url).searchParams];
    if (query.length !== 2 || query.filter(([key]) => key === "job_id").length !== 1 || query.filter(([key]) => key === "asset_id").length !== 1) invalidInput();
    const params = new URLSearchParams(query);
    const jobId = inputId(params.get("job_id")), assetId = inputId(params.get("asset_id"));
    const binding = await readBinding(client, jobId, assetId);
    const asset = await readCreativeAsset(client, assetId);
    checkAsset(asset, binding.job, binding.media);
    const { data, error } = await client.storage.from(CREATIVE_BUCKET).download(asset.storage_path);
    if (error || !data) throw new MarketingError("Chưa tải được ảnh riêng tư. Vui lòng thử lại.", 503, "storage_unavailable");
    if (data.size > 8388608) unavailable();
    const bytes = new Uint8Array(await data.arrayBuffer());
    const actual = inspectCreativeImage(bytes, asset.mime_type);
    matchesCreativeBytes(asset, actual);
    if (actual.reported_sha256 !== binding.media.sha256 || actual.byte_size !== binding.media.byte_size) unavailable();
    // Storage awaits can outlive a scope/rights change. Re-read with the same user JWT before releasing bytes.
    const currentAsset = await readCreativeAsset(client, assetId);
    const current = await readBinding(client, jobId, assetId);
    checkAsset(currentAsset, current.job, current.media);
    if (JSON.stringify(current.media) !== JSON.stringify(binding.media)) unavailable();
    const until = Math.min(Date.now() + 30000, currentAsset.valid_until ? Date.parse(currentAsset.valid_until) : Infinity);
    if (until <= Date.now()) unavailable();
    return new Response(bytes, { headers: {
      "Content-Type": asset.mime_type, "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename=calendar-preview.${asset.mime_type === "image/png" ? "png" : "jpg"}`,
      "X-Marketing-Preview-Until": new Date(until).toISOString(),
    } });
  } catch (error) { return marketingErrorResponse(error); }
}
