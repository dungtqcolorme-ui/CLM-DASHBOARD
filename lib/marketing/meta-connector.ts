import "server-only";
import type { MetaCapabilities } from "@/lib/marketing/publishing-types";
export type RemoteReceipt={state:"published"|"remote_scheduled"|"cancelled"|"cancel_pending"|"unknown"|"failed";remote_id:string|null;verified:boolean;response_reference:string};
export type ApprovedMetaPayload={snapshot:Record<string,unknown>;payload_hash:string;page_id:string;idempotency_key:string};
export interface MetaConnector{
 getCapabilities():MetaCapabilities;
 verifyAccount():Promise<{page_id:string;page_name:string;tasks:string[];expires_at:string|null}>;
 listAuthorizedAssets():Promise<{id:string;name:string;tasks:string[]}[]>;
 readOwnedPosts(cursor?:string):Promise<{posts:Record<string,unknown>[];next:string|null}>;
 readPermittedComments(postId:string,cursor?:string):Promise<{aggregate:Record<string,number>;next:string|null}>;
 getSupportedOrganicMetrics():Promise<{name:string;unit:string;definition:string}[]>;
 uploadMedia(bytes:Uint8Array,mime:string):Promise<{id:string}>;
 scheduleApprovedPost(payload:ApprovedMetaPayload):Promise<RemoteReceipt>;
 publishApprovedPost(payload:ApprovedMetaPayload):Promise<RemoteReceipt>;
 cancelScheduledPost(remoteId:string):Promise<RemoteReceipt>;
 getRemoteStatus(remoteId:string):Promise<RemoteReceipt>;
}
/** No fixture mode or arbitrary MCP executor is reachable in production.
 * OAuth and the current version-specific Graph endpoints must be verified on
 * the selected application before replacing this explicitly unavailable driver.
 */
export class UnconfiguredMetaConnector implements MetaConnector{
 getCapabilities():MetaCapabilities{return {read_posts:false,read_comments:false,organic_metrics:false,upload_media:false,publish:false,schedule:false,cancel:false};}
 private unavailable():never{throw new Error("Meta chưa cấu hình và chưa xác minh khả năng API.");}
 async verifyAccount():ReturnType<MetaConnector["verifyAccount"]>{return this.unavailable();}
 async listAuthorizedAssets():ReturnType<MetaConnector["listAuthorizedAssets"]>{return this.unavailable();}
 async readOwnedPosts():ReturnType<MetaConnector["readOwnedPosts"]>{return this.unavailable();}
 async readPermittedComments():ReturnType<MetaConnector["readPermittedComments"]>{return this.unavailable();}
 async getSupportedOrganicMetrics():ReturnType<MetaConnector["getSupportedOrganicMetrics"]>{return this.unavailable();}
 async uploadMedia():ReturnType<MetaConnector["uploadMedia"]>{return this.unavailable();}
 async scheduleApprovedPost():ReturnType<MetaConnector["scheduleApprovedPost"]>{return this.unavailable();}
 async publishApprovedPost():ReturnType<MetaConnector["publishApprovedPost"]>{return this.unavailable();}
 async cancelScheduledPost():ReturnType<MetaConnector["cancelScheduledPost"]>{return this.unavailable();}
 async getRemoteStatus():ReturnType<MetaConnector["getRemoteStatus"]>{return this.unavailable();}
}
