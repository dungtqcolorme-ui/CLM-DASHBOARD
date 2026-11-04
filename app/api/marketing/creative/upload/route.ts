import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError } from "@/lib/marketing/domain";
import { CREATIVE_BUCKET, matchesCreativeBytes, readCreativeAsset, readCreativeBytes, requireCreativeWrite } from "@/lib/marketing/creative-server";
import { inspectCreativeImage } from "@/lib/marketing/creative-image";
import { databaseError, marketingErrorResponse, marketingResponse } from "@/lib/marketing/server";

export async function POST(request: Request) {
  try {
    const {client,profile}=await getDashboardRequestIdentity(request);requireCreativeWrite(profile.roles,request);
    const mime=(request.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
    if(!["image/png","image/jpeg"].includes(mime))throw new MarketingError("Chỉ nhận ảnh PNG hoặc JPEG.",415,"unsupported_media_type");
    const asset=await readCreativeAsset(client,new URL(request.url).searchParams.get("reservation"));
    const bytes=await readCreativeBytes(request), actual=inspectCreativeImage(bytes,mime);
    if(mime!==asset.mime_type)throw new MarketingError("Định dạng không khớp file đã đăng ký.");
    matchesCreativeBytes(asset,actual);
    if(asset.status==="ready")return marketingResponse({result:asset});
    const {error:uploadError}=await client.storage.from(CREATIVE_BUCKET).upload(asset.storage_path,bytes,{contentType:mime,upsert:false,cacheControl:"0"});
    // If upload succeeded but finalization was interrupted, SQL can confirm the
    // existing immutable object on retry; a transport error never means success.
    const {data,error}=await client.rpc("marketing_creative_command",{p_command:{action:"complete_asset",id:asset.id,expected_version:asset.version}});
    if(error){if(uploadError)throw new MarketingError("Chưa hoàn tất tải ảnh. Kiểm tra cấu hình Storage và thử lại đúng file.",503,"storage_unavailable");databaseError(error);}
    return marketingResponse({result:data});
  }catch(error){return marketingErrorResponse(error);}
}
