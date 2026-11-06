import {getDashboardRequestIdentity} from "@/lib/dashboardSession";
import {MarketingError} from "@/lib/marketing/domain";
import {requireCreativeWrite} from "@/lib/marketing/creative-server";
import {parseReportCommand} from "@/lib/marketing/report-domain";
import {readReportWorkspace} from "@/lib/marketing/report-server";
import {databaseError,marketingErrorResponse,marketingResponse,readBoundedJson} from "@/lib/marketing/server";
export async function GET(r:Request){try{const {client}=await getDashboardRequestIdentity(r);return marketingResponse(await readReportWorkspace(client));}catch(e){return marketingErrorResponse(e);}}
export async function POST(r:Request){try{const {client,profile}=await getDashboardRequestIdentity(r);requireCreativeWrite(profile.roles,r);const c=parseReportCommand(await readBoundedJson(r));if(c.action==="approve_report_share"&&!profile.roles.some(x=>["Admin","PR Leader"].includes(x)))throw new MarketingError("Duyệt chia sẻ cần Leader/Admin.",403,"forbidden");const {data,error}=await client.rpc("marketing_report_command",{p_command:c});if(error)databaseError(error);return marketingResponse({result:data});}catch(e){return marketingErrorResponse(e);}}
