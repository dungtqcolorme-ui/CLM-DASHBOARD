import {getDashboardRequestIdentity} from "@/lib/dashboardSession";
import {MarketingError} from "@/lib/marketing/domain";
import {requireCreativeWrite} from "@/lib/marketing/creative-server";
import {parseVideoCommand} from "@/lib/marketing/video-domain";
import {readVideoWorkspace} from "@/lib/marketing/video-server";
import {databaseError,marketingErrorResponse,marketingResponse,readBoundedJson} from "@/lib/marketing/server";
export async function GET(r:Request){try{const {client}=await getDashboardRequestIdentity(r);return marketingResponse(await readVideoWorkspace(client));}catch(e){return marketingErrorResponse(e);}}
export async function POST(r:Request){try{const {client,profile}=await getDashboardRequestIdentity(r);requireCreativeWrite(profile.roles,r);const c=parseVideoCommand(await readBoundedJson(r));if(c.action==="review_video_source"&&!profile.roles.some(x=>["Admin","PR Leader"].includes(x)))throw new MarketingError("Duyệt quyền cần Leader/Admin.",403,"forbidden");const {data,error}=await client.rpc("marketing_video_command",{p_command:c});if(error)databaseError(error);return marketingResponse({result:data});}catch(e){return marketingErrorResponse(e);}}
