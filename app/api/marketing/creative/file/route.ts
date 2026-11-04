import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError } from "@/lib/marketing/domain";
import { CREATIVE_BUCKET, matchesCreativeBytes, readCreativeAsset } from "@/lib/marketing/creative-server";
import { inspectCreativeImage } from "@/lib/marketing/creative-image";
import { marketingErrorResponse } from "@/lib/marketing/server";

export async function GET(request: Request) {
  try {
    const {client}=await getDashboardRequestIdentity(request);
    const asset=await readCreativeAsset(client,new URL(request.url).searchParams.get("id"));
    if(asset.status!=="ready")throw new MarketingError("Ảnh chưa tải hoàn tất.",409,"asset_not_ready");
    const {data,error}=await client.storage.from(CREATIVE_BUCKET).download(asset.storage_path);
    if(error||!data)throw new MarketingError("Chưa tải được ảnh gốc. Kiểm tra quyền hoặc cấu hình Storage.",503,"storage_unavailable");
    if(data.size>8388608)throw new MarketingError("Ảnh vượt giới hạn dung lượng.",413,"payload_too_large");
    const bytes=new Uint8Array(await data.arrayBuffer());matchesCreativeBytes(asset,inspectCreativeImage(bytes,asset.mime_type));
    return new Response(bytes,{headers:{"Content-Type":asset.mime_type,"Content-Length":String(bytes.length),"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Disposition":"inline; filename=original."+(asset.mime_type==="image/png"?"png":"jpg")}});
  }catch(error){return marketingErrorResponse(error);}
}
