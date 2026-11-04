import type { CreativeDesign } from "@/lib/marketing/creative-types";

// Private session RAM only: no caption, raster, token or scene is persisted to
// browser storage. A navigation can remount the editor without losing its base.
const drafts = new Map<string, CreativeDesign>();
const key = (user: string, content: string) => `${user}:${content}`;
export function readSceneDraft(user: string, content: string): CreativeDesign | null { return drafts.get(key(user, content)) ?? null; }
export function rememberSceneDraft(user: string, content: string, draft: CreativeDesign) {
  const id = key(user, content); drafts.delete(id); drafts.set(id, draft);
  while (drafts.size > 20) drafts.delete(drafts.keys().next().value!);
}
export function forgetSceneDraft(user: string, content: string, snapshot?: CreativeDesign): boolean {
  const id = key(user, content); if (snapshot && drafts.get(id) !== snapshot) return false; return drafts.delete(id);
}
export function clearSceneDrafts() { drafts.clear(); }

// Only an authoritative scope result or explicit identity/access invalidation
// may evict the sole unsaved copy; transient read failures have neither.
export function shouldClearSceneDraft(invalidated:boolean, data:{designs:Pick<CreativeDesign,'id'|'content_id'>[]}|null, draft:CreativeDesign|null, content:string){
  return invalidated || !!(data && draft && !data.designs.some(d=>d.id===draft.id&&d.content_id===content));
}
// Shared mutable gate: callbacks retained by pointer listeners see pending state
// immediately, including before React commits the disabled fieldset.
export function createSceneMutationGate(){let pending=false;return {allowed:(editable:boolean)=>editable&&!pending,begin:()=>{if(pending)return false;pending=true;return true;},end:()=>{pending=false;}};}
