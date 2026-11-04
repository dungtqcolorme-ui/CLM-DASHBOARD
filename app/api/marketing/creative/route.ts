import { getDashboardRequestIdentity } from "@/lib/dashboardSession";
import { MarketingError } from "@/lib/marketing/domain";
import { parseCreativeCommand } from "@/lib/marketing/creative-domain";
import { readCreativeWorkspace, requireCreativeWrite } from "@/lib/marketing/creative-server";
import { databaseError, marketingErrorResponse, marketingResponse, readBoundedJson } from "@/lib/marketing/server";

export async function GET(request: Request) {
  try { const {client}=await getDashboardRequestIdentity(request);return marketingResponse(await readCreativeWorkspace(client)); }
  catch(error){return marketingErrorResponse(error);}
}
export async function POST(request: Request) {
  try {
    const {client,profile}=await getDashboardRequestIdentity(request);requireCreativeWrite(profile.roles,request);
    const command=parseCreativeCommand(await readBoundedJson(request));
    if(["review_asset","review_template"].includes(command.action) && !profile.roles.some(role=>["Admin","PR Leader"].includes(role)))throw new MarketingError("Review cần PR Leader hoặc Admin.",403,"forbidden");
    const {data,error}=await client.rpc("marketing_creative_command",{p_command:command});if(error)databaseError(error);
    return marketingResponse({result:data});
  }catch(error){return marketingErrorResponse(error);}
}
