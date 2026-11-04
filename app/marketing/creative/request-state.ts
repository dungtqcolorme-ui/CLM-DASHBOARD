/** Internal cancellation never becomes a user-facing API failure. */
export class CreativeCancelled extends Error { constructor(){super('Creative request cancelled');} }
export function assertCreativeCurrent(current:()=>boolean){if(!current())throw new CreativeCancelled();}
export async function readCreativeBody<T>(read:()=>Promise<T>,current:()=>boolean):Promise<T>{assertCreativeCurrent(current);const value=await read();assertCreativeCurrent(current);return value;}
export function guardCreativeResponse(response:Response,current:()=>boolean):Response{return new Proxy(response,{get(target,key){if(['json','blob','arrayBuffer','text'].includes(String(key)))return ()=>readCreativeBody(()=>Reflect.get(target,key,target).call(target),current);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});}

// A denied individual raster does not invalidate the authenticated workspace.
export function invalidatesCreativeAccess(status:number,code:unknown){return status===401||(status===403&&code!=='asset_unavailable');}
