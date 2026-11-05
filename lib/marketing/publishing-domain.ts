import { MarketingError } from "@/lib/marketing/domain";
import { creativeId } from "@/lib/marketing/creative-domain";
import type { MediaAttestation, PublishingCommand } from "./publishing-types";
function invalid():never{throw new MarketingError("Dữ liệu duyệt/xuất bản không hợp lệ.",400,"invalid_input");}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))invalid();return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string[]){if(Object.keys(v).length!==allowed.length||allowed.some(k=>!Object.hasOwn(v,k)))invalid();}
function version(v:unknown):number{if(!Number.isInteger(v)||(v as number)<1||(v as number)>2147483647)invalid();return v as number;}
function reason(v:unknown){if(typeof v!=="string"||!v.trim()||v.length>2000||v.includes("\0"))invalid();return v.trim();}
function hash(v:unknown){if(typeof v!=="string"||!/^[a-f0-9]{64}$/.test(v))invalid();return v;}
function time(v:unknown,now:number){if(typeof v!=="string"||!/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v))invalid();const day=new Date(v.slice(0,10)+"T00:00:00Z");if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==v.slice(0,10)||Number(v.slice(11,13))>23||Number(v.slice(14,16))>59||Number(v.slice(17,19)||0)>59)invalid();const t=Date.parse(v);if(!Number.isFinite(t)||t<now+300000||t>now+30*86400000)invalid();const iso=new Date(t).toISOString();if(!/^[1-9]\d{3}-/.test(iso))invalid();return iso;}
export function parsePublishingCommand(value:unknown,now=Date.now()):PublishingCommand{
 const v=object(value),a=v.action;
 if(a==="request_candidate"){
  keys(v,["action","content_id","expected_content_version","connection_id","mode","design_id","final_asset_ids","scheduled_for"]);
  if(!["text","photo_dump","design"].includes(v.mode as string)||!Array.isArray(v.final_asset_ids)||v.final_asset_ids.length>10)invalid();
  const ids=v.final_asset_ids.map(creativeId),design=v.design_id===null?null:creativeId(v.design_id);if(new Set(ids).size!==ids.length)invalid();
  if((v.mode==="text"&&(ids.length||design))||(v.mode==="photo_dump"&&(!ids.length||design))||(v.mode==="design"&&(!design||!ids.length)))invalid();
  return {action:a,content_id:creativeId(v.content_id),expected_content_version:version(v.expected_content_version),connection_id:creativeId(v.connection_id),mode:v.mode as "text"|"photo_dump"|"design",design_id:design,final_asset_ids:ids,scheduled_for:time(v.scheduled_for,now)};
 }
 if(a==="approve_and_schedule"){keys(v,["action","id","expected_version","expected_hash","confirmed"]);if(v.confirmed!==true)invalid();return {action:a,id:creativeId(v.id),expected_version:version(v.expected_version),expected_hash:hash(v.expected_hash),confirmed:true};}
 if(!["reject_candidate","cancel_job","acknowledge_incident","resolve_incident"].includes(a as string))invalid();keys(v,["action","id","expected_version","reason"]);return {action:a as "reject_candidate"|"cancel_job"|"acknowledge_incident"|"resolve_incident",id:creativeId(v.id),expected_version:version(v.expected_version),reason:reason(v.reason)};
}
export function assertMediaAttestation(expected:readonly MediaAttestation[],actual:readonly MediaAttestation[]){
 if(expected.length!==actual.length||expected.length>30||new Set(expected.map(a=>a.asset_id)).size!==expected.length||new Set(actual.map(a=>a.asset_id)).size!==actual.length)invalid();
 for(const e of expected){const a=actual.find(x=>x.asset_id===e.asset_id);if(!a||a.asset_version!==e.asset_version||a.byte_size!==e.byte_size||a.sha256!==e.sha256)throw new MarketingError("Ảnh đã thay đổi so với snapshot. Cần chuẩn bị và duyệt lại.",409,"media_changed");}
}
export function safePublishingReceipt(value:unknown):Record<string,unknown>{
 const r=object(value);if(!["published","remote_scheduled","cancelled","cancel_pending","unknown","failed"].includes(r.state as string)||typeof r.verified!=="boolean"||typeof r.response_reference!=="string"||!/^[A-Za-z0-9_.:-]{1,200}$/.test(r.response_reference))invalid();
 const remote=r.remote_id===null||r.remote_id===undefined?null:r.remote_id;
 if(remote!==null&&(typeof remote!=="string"||!/^\d{1,40}(?:_\d{1,40})?$/.test(remote)))invalid();
 if(r.verified&&["published","remote_scheduled","cancelled"].includes(r.state as string)&&!remote)invalid();
 return {state:r.state,remote_id:remote,verified:r.verified,response_reference:r.response_reference};
}
