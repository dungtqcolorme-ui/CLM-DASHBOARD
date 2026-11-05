import {timingSafeEqual} from "node:crypto";
import {marketingErrorResponse,marketingResponse} from "@/lib/marketing/server";
import {MarketingError} from "@/lib/marketing/domain";
/** No client-selected fixture/provider; no automatic cron is installed. */
export async function POST(request:Request){try{
 const secret=process.env.MARKETING_WORKER_SECRET;if(!secret)throw new MarketingError("Worker chưa cấu hình.",503,"worker_not_configured");
 const supplied=request.headers.get("authorization")||"",expected=`Bearer ${secret}`;
 if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new MarketingError("Worker không có quyền.",401,"unauthorized");
 // Compatibility and real OAuth/account capabilities have not been verified;
 // even setting a LIVE flag cannot substitute for a supported production driver.
 return marketingResponse({status:"not_configured",detail:"Chưa có production Meta connector đã xác minh. Không claim job hoặc gửi yêu cầu Meta."},503);
}catch(e){return marketingErrorResponse(e);}}
