import "server-only";
import type { GatewayCommand, MarketingConnection, PublicationIntent, PublishingJob } from "@/lib/marketing/publishing-types";
import type { MetaConnector } from "@/lib/marketing/meta-connector";
import { safePublishingReceipt } from "@/lib/marketing/publishing-domain";
export type PublishingGateway={command:<T=unknown>(value:GatewayCommand)=>Promise<T>};
type Bundle={job:PublishingJob;candidate:PublicationIntent;connection:MarketingConnection};
export async function runPublishingWorkerOnce({gateway,connectorFor,enabled,workerId,verifyMedia}:{gateway:PublishingGateway;connectorFor:(connectionId:string)=>Promise<MetaConnector>;enabled:boolean;workerId:string;verifyMedia:(bundle:Bundle)=>Promise<void>}){
 if(!enabled)return {status:"not_configured"};
 const job=await gateway.command<PublishingJob|null>({action:"claim_job",worker_id:workerId,lease_seconds:60});if(!job?.lease_id)return {status:"idle"};
 let started=false;
 try{
  const connector=await connectorFor(job.connection_id);if(!connector.getCapabilities().publish){await gateway.command({action:"release_job",id:job.id,lease_id:job.lease_id,reason:"Connector unavailable"});return {status:"not_configured"};}
  const inspected=await gateway.command<Bundle|null>({action:"inspect_job",id:job.id,lease_id:job.lease_id});if(!inspected)return {status:"blocked"};await verifyMedia(inspected);
  const bundle=await gateway.command<Bundle|null>({action:"begin_dispatch",id:job.id,lease_id:job.lease_id});if(!bundle)return {status:"blocked"};started=true;
  const raw=await connector.publishApprovedPost({snapshot:bundle.candidate.snapshot!,payload_hash:bundle.candidate.payload_hash!,page_id:bundle.connection.page_id,idempotency_key:job.idempotency_key});
  const safe=safePublishingReceipt(raw);const outcome=raw.verified&&["published","remote_scheduled"].includes(raw.state)?raw.state as "published"|"remote_scheduled":"unknown";const receipt={...safe,state:outcome,verified:outcome!=="unknown"};
  await gateway.command({action:"complete_job",id:job.id,lease_id:job.lease_id,outcome,remote_id:raw.remote_id,receipt,error:outcome==="unknown"?"Remote result requires reconciliation":null});return {status:outcome};
 }catch{
  if(started){await gateway.command({action:"complete_job",id:job.id,lease_id:job.lease_id,outcome:"unknown",remote_id:null,receipt:{state:"unknown",remote_id:null,verified:false,response_reference:"transport-unavailable"},error:"Remote result unavailable; reconciliation required"});return {status:"unknown"};}
  await gateway.command({action:"release_job",id:job.id,lease_id:job.lease_id,reason:"Preflight or connector unavailable"});return {status:"blocked"};
 }
}
/** Reconciliation is a separate operation; it never republishes an unknown job. */
export async function reconcilePublishingJob({gateway,connector,job,enabled}:{gateway:PublishingGateway;connector:MetaConnector;job:PublishingJob;enabled:boolean}){
 if(!enabled)return {status:"not_configured"};
 if(!job.remote_id)return {status:"manual_reconciliation_required"};
 try{
  let raw=await connector.getRemoteStatus(job.remote_id);
  if(raw.remote_id!==job.remote_id)throw new Error("Remote identity mismatch");
  if((job.status==="cancel_pending"||job.cancel_requested_at)&&raw.state==="remote_scheduled"&&raw.verified){
   if(!connector.getCapabilities().cancel){await gateway.command({action:"reconcile_job",id:job.id,expected_version:job.version,outcome:"remote_scheduled",remote_id:job.remote_id,receipt:safePublishingReceipt(raw)});return {status:"cancel_pending"};}
   raw=await connector.cancelScheduledPost(job.remote_id);
   if(raw.remote_id!==job.remote_id)throw new Error("Remote identity mismatch");
  }
  const safe=safePublishingReceipt(raw);
  const outcome=raw.verified&&["published","remote_scheduled","cancelled"].includes(raw.state)?raw.state as "published"|"remote_scheduled"|"cancelled":"unknown";
  const receipt={...safe,state:outcome,verified:outcome!=="unknown"};
  await gateway.command({action:"reconcile_job",id:job.id,expected_version:job.version,outcome,remote_id:raw.remote_id,receipt});return {status:outcome};
 }catch{
  await gateway.command({action:"reconcile_job",id:job.id,expected_version:job.version,outcome:"unknown",remote_id:job.remote_id,receipt:{state:"unknown",remote_id:job.remote_id,verified:false,response_reference:"reconciliation-unavailable"}});return {status:"unknown"};
 }
}
