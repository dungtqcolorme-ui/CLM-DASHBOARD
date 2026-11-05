import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getSupabaseAdmin} from "@/lib/supabaseAdmin";
import {MarketingError} from "@/lib/marketing/domain";
import {databaseError,readMarketingRows} from "@/lib/marketing/server";
import {creativeId} from "@/lib/marketing/creative-domain";
import {CREATIVE_BUCKET,readCreativeAsset,matchesCreativeBytes} from "@/lib/marketing/creative-server";
import {inspectCreativeImage} from "@/lib/marketing/creative-image";
import {assertMediaAttestation} from "@/lib/marketing/publishing-domain";
import type {GatewayCommand,MediaAttestation,PublicationIntent,PublishingWorkspace} from "@/lib/marketing/publishing-types";
import type {PublishingGateway} from "@/lib/marketing/publishing-worker";

export function getPublishingGateway():PublishingGateway{
 let client:SupabaseClient;try{client=getSupabaseAdmin();}catch{throw new MarketingError("Cổng xác minh snapshot/worker chưa được cấu hình trên server. Không tạo snapshot đã xác minh giả.",503,"gateway_not_configured");}
 return {async command<T>(command:GatewayCommand):Promise<T>{const {data,error}=await client.rpc("marketing_publishing_gateway_command",{p_command:command});if(error)databaseError(error);return data as T;}};
}
export async function readPublishingWorkspace(client:SupabaseClient):Promise<PublishingWorkspace>{
 const [connections,candidates,jobs,incidents,events]=await Promise.all([
  readMarketingRows(client,"marketing_connections","id,team_id,provider,page_id,page_name,graph_version,status,capabilities,verified_at,expires_at,confirmed_by,version,created_at,updated_at",500),
  readMarketingRows(client,"marketing_publication_candidates","*",1000),readMarketingRows(client,"marketing_publishing_jobs","*",1000),readMarketingRows(client,"marketing_publishing_incidents","*",1000),readMarketingRows(client,"marketing_publishing_events","*",2000),
 ]);
 let gateway:"available"|"not_configured"="not_configured";try{getPublishingGateway();gateway="available";}catch{/* Presence-only configuration check; no remote call. */}
 return {connections,candidates,jobs,incidents,events,capabilities:{gateway,meta_oauth:"unsupported",live_publish:false,detail:"Meta OAuth/Graph API và Page Partnership chưa được xác minh. Cổng live đang tắt; hàng đợi nội bộ không phải lịch Meta đã xác nhận."}} as unknown as PublishingWorkspace;
}
export async function readPublicationCandidate(client:SupabaseClient,id:unknown):Promise<PublicationIntent>{const {data,error}=await client.from("marketing_publication_candidates").select("*").eq("id",creativeId(id)).maybeSingle();if(error)databaseError(error);if(!data)throw new MarketingError("Snapshot không có trong phạm vi truy cập.",404,"not_found");return data as PublicationIntent;}
export async function attestPublicationMedia(client:SupabaseClient,candidate:PublicationIntent):Promise<MediaAttestation[]>{
 const ids=[...new Set([...candidate.final_asset_ids,...candidate.binding.source_asset_ids])];if(ids.length>30)throw new MarketingError("Snapshot vượt giới hạn ảnh.");
 const result:MediaAttestation[]=[];
 for(const id of ids){const asset=await readCreativeAsset(client,id);if(asset.status!=="ready"||asset.team_id!==candidate.team_id||asset.rights!=="approved"||!asset.allowed_channels.includes("facebook")||asset.version!==candidate.binding.asset_versions[id])throw new MarketingError("Nguồn/quyền ảnh đã thay đổi. Chuẩn bị snapshot mới.",409,"media_changed");
  const {data,error}=await client.storage.from(CREATIVE_BUCKET).download(asset.storage_path);if(error||!data)throw new MarketingError("Chưa đọc được ảnh gốc để xác minh snapshot.",503,"storage_unavailable");if(data.size>8388608)throw new MarketingError("Ảnh vượt giới hạn.",413,"payload_too_large");
  const actual=inspectCreativeImage(new Uint8Array(await data.arrayBuffer()),asset.mime_type);matchesCreativeBytes(asset,actual);result.push({asset_id:id,asset_version:asset.version,byte_size:actual.byte_size,sha256:actual.reported_sha256});
 }
 return result;
}
export async function verifyPublicationMedia(client:SupabaseClient,candidate:PublicationIntent){const media=candidate.snapshot?.media;if(!Array.isArray(media))throw new MarketingError("Snapshot chưa có xác minh byte.",409,"not_sealed");assertMediaAttestation(media as MediaAttestation[],await attestPublicationMedia(client,candidate));}
