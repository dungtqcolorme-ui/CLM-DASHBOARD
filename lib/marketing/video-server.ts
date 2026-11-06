import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {readMarketingRows,databaseError} from "@/lib/marketing/server";
import {MarketingError} from "@/lib/marketing/domain";
import {creativeId} from "@/lib/marketing/creative-domain";
import type {VideoSource,VideoWorkspace} from "@/lib/marketing/video-types";
export const FOOTAGE_BUCKET="marketing-footage";
export async function readVideoWorkspace(client:SupabaseClient):Promise<VideoWorkspace>{const [sources,projects,versions,jobs]=await Promise.all([readMarketingRows(client,"marketing_video_sources","*",1000),readMarketingRows(client,"marketing_video_projects","*",500),readMarketingRows(client,"marketing_video_versions","*",2000),readMarketingRows(client,"marketing_video_render_jobs","*",1000)]);return {sources,projects,versions,jobs,capabilities:{render:"not_configured",transcription:"not_configured",ai_rough_cut:"not_configured"}} as unknown as VideoWorkspace;}
export async function videoSourceUrl(client:SupabaseClient,value:unknown){const {data,error}=await client.from("marketing_video_sources").select("*").eq("id",creativeId(value)).maybeSingle();if(error)databaseError(error);if(!data)throw new MarketingError("Nguồn không có trong phạm vi truy cập.",404,"not_found");const s=data as VideoSource;
 if(s.status!=="ready"||s.rights==="revoked"||s.valid_until&&(!Number.isFinite(Date.parse(s.valid_until))||Date.parse(s.valid_until)<=Date.now()))throw new MarketingError("Nguồn chưa sẵn sàng hoặc quyền đã hết hiệu lực.",403,"asset_unavailable");
 const ext={"video/mp4":"mp4","video/webm":"webm","audio/mpeg":"mp3","audio/wav":"wav"}[s.mime_type];if(!ext||s.storage_path!==s.team_id+"/"+s.id+"/original."+ext)throw new MarketingError("Đường dẫn nguồn không hợp lệ.");
 const {data:signed,error:signError}=await client.storage.from(FOOTAGE_BUCKET).createSignedUrl(s.storage_path,60);if(signError||!signed?.signedUrl)throw new MarketingError("Chưa tạo được link nguồn riêng tư.",503,"storage_unavailable");return {url:signed.signedUrl,expires_in:60,source_version:s.version};
}
