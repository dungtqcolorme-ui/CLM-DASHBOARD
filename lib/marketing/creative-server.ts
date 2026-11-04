import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MarketingError } from "@/lib/marketing/domain";
import { databaseError, readMarketingRows } from "@/lib/marketing/server";
import { creativeId } from "@/lib/marketing/creative-domain";
import type { CreativeAsset, CreativeWorkspace } from "./creative-types";

export const CREATIVE_BUCKET = "marketing-originals";
export function requireCreativeWrite(roles: readonly string[], request: Request) {
  if (!roles.some(role=>["Admin","PR Leader","PR Representative"].includes(role))) throw new MarketingError("Viewer chỉ có quyền xem.",403,"forbidden");
  const origin=request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) throw new MarketingError("Nguồn yêu cầu không hợp lệ.",403,"forbidden");
}
export async function readCreativeWorkspace(client: SupabaseClient): Promise<CreativeWorkspace> {
  const [assets,designs,templates,versions]=await Promise.all([
    readMarketingRows(client,"marketing_assets","*",1000),
    readMarketingRows(client,"marketing_designs","*",500),
    readMarketingRows(client,"marketing_templates","*",500),
    readMarketingRows(client,"marketing_creative_versions","*",2000),
  ]);
  return {assets,designs,templates,versions,capabilities:{drive:"not_connected",image_upload:"available",png_export:"available",ai_design:"not_configured"}} as unknown as CreativeWorkspace;
}
export async function readCreativeAsset(client: SupabaseClient, value: unknown): Promise<CreativeAsset> {
  const id=creativeId(value);
  const {data,error}=await client.from("marketing_assets").select("*").eq("id",id).maybeSingle();
  if(error)databaseError(error);
  if(!data)throw new MarketingError("Ảnh không có trong phạm vi truy cập.",404,"not_found");
  const asset=data as CreativeAsset;
  if(asset.rights==="revoked" || (asset.valid_until && (!Number.isFinite(Date.parse(asset.valid_until)) || Date.parse(asset.valid_until)<=Date.now()))) throw new MarketingError("Quyền sử dụng ảnh đã hết hạn hoặc bị thu hồi.",403,"asset_unavailable");
  const extension=asset.mime_type==="image/png"?"png":asset.mime_type==="image/jpeg"?"jpg":null;
  if(!extension || asset.storage_path!==`${asset.team_id}/${asset.id}/original.${extension}`) throw new MarketingError("Nguồn ảnh không hợp lệ.",400,"invalid_asset");
  return asset;
}
export async function readCreativeBytes(request: Request): Promise<Uint8Array> {
  const limit=8388608;
  if(Number(request.headers.get("content-length"))>limit)throw new MarketingError("File vượt giới hạn 8 MiB.",413,"payload_too_large");
  if(!request.body)throw new MarketingError("Thiếu file ảnh.");
  const reader=request.body.getReader(), chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new MarketingError("File vượt giới hạn 8 MiB.",413,"payload_too_large");}chunks.push(value);}}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
export function matchesCreativeBytes(asset: CreativeAsset, actual: {width:number;height:number;byte_size:number;reported_sha256:string}) {
  if(["width","height","byte_size","reported_sha256"].some(key=>asset[key as keyof typeof actual]!==actual[key as keyof typeof actual])) throw new MarketingError("File không khớp ảnh gốc đã đăng ký. Cần tải đúng file hoặc đăng ký ảnh mới.",400,"asset_mismatch");
}
