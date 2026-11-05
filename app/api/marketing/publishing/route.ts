import {getDashboardRequestIdentity} from "@/lib/dashboardSession";
import {MarketingError} from "@/lib/marketing/domain";
import {requireCreativeWrite} from "@/lib/marketing/creative-server";
import {parsePublishingCommand} from "@/lib/marketing/publishing-domain";
import {attestPublicationMedia,getPublishingGateway,readPublicationCandidate,readPublishingWorkspace,verifyPublicationMedia} from "@/lib/marketing/publishing-server";
import type {PublicationIntent} from "@/lib/marketing/publishing-types";
import {databaseError,marketingErrorResponse,marketingResponse,readBoundedJson} from "@/lib/marketing/server";
export async function GET(request:Request){try{const {client}=await getDashboardRequestIdentity(request);return marketingResponse(await readPublishingWorkspace(client));}catch(e){return marketingErrorResponse(e);}}
export async function POST(request:Request){try{
 const {client,profile}=await getDashboardRequestIdentity(request);requireCreativeWrite(profile.roles,request);const command=parsePublishingCommand(await readBoundedJson(request));
 if(["approve_and_schedule","reject_candidate","resolve_incident"].includes(command.action)&&!profile.roles.some(r=>["Admin","PR Leader"].includes(r)))throw new MarketingError("Thao tác cần Leader/Admin đúng phạm vi.",403,"forbidden");
 const gateway=command.action==="request_candidate"?getPublishingGateway():null;
 if(command.action==="approve_and_schedule")await verifyPublicationMedia(client,await readPublicationCandidate(client,command.id));
 const {data,error}=await client.rpc("marketing_publishing_command",{p_command:command});if(error)databaseError(error);
 if(gateway&&command.action==="request_candidate"){const candidate=data as PublicationIntent;const media=await attestPublicationMedia(client,candidate);return marketingResponse({result:await gateway.command({action:"seal_candidate",id:candidate.id,expected_version:candidate.version,media})});}
 return marketingResponse({result:data});
}catch(e){return marketingErrorResponse(e);}}
