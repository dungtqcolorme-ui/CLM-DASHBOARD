import {getDashboardRequestIdentity} from "@/lib/dashboardSession";
import {MarketingError} from "@/lib/marketing/domain";
import {videoSourceUrl} from "@/lib/marketing/video-server";
import {marketingErrorResponse,marketingResponse} from "@/lib/marketing/server";
export async function GET(r:Request){try{const {client}=await getDashboardRequestIdentity(r);const p=new URL(r.url).searchParams;if([...p.keys()].length!==1||p.getAll("id").length!==1)throw new MarketingError("Chỉ chấp nhận ID nguồn.");return marketingResponse(await videoSourceUrl(client,p.get("id")));}catch(e){return marketingErrorResponse(e);}}
