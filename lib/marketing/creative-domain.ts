import { MarketingError } from "@/lib/marketing/domain";
import type { CreativeAsset, CreativeCommand, CreativeDesign, CreativeIssue, CreativeLayer, CreativeScene } from "./creative-types";

function invalid(field: string): never { throw new MarketingError(`Giá trị ${field} không hợp lệ.`, 400, "invalid_input"); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid("dữ liệu"); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: string[]) { if (Object.keys(value).length !== allowed.length || allowed.some(k => !Object.hasOwn(value, k))) invalid("trường dữ liệu"); }
function text(value: unknown, max: number, required = false, trim = true): string { if (typeof value !== "string" || value.length > max || value.includes("\0") || (required && !value.trim())) invalid("văn bản"); return trim ? value.trim() : value; }
export function creativeId(value: unknown): string { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) invalid("UUID"); return value.toLowerCase(); }
function number(value: unknown, min: number, max: number, integer = false): number { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid("số"); return value; }
function version(value: unknown) { return number(value, 1, 2147483647, true); }
function choice<T extends string>(value: unknown, allowed: readonly T[]): T { if (typeof value !== "string" || !allowed.includes(value as T)) invalid("lựa chọn"); return value as T; }
function color(value: unknown) { if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) invalid("màu HEX"); return value; }
function nullableId(value: unknown) { return value === null ? null : creativeId(value); }
function stringList(value: unknown, max: number, length: number) { if (!Array.isArray(value) || value.length > max) invalid("danh sách"); const list = value.map(v => text(v, length, true)); if (new Set(list).size !== list.length) invalid("phần tử trùng"); return list; }
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid("thời gian có múi giờ");
  const day = new Date(`${value.slice(0,10)}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== value.slice(0,10) || Number(value.slice(11,13)) > 23 || Number(value.slice(14,16)) > 59 || Number(value.slice(17,19) || 0) > 59) invalid("ngày giờ");
  const parsed = new Date(value); if (!Number.isFinite(parsed.getTime()) || !/^[1-9]\d{3}-/.test(parsed.toISOString())) invalid("thời gian"); return parsed.toISOString();
}
export function parseCreativeScene(value: unknown): CreativeScene {
  const s = object(value); keys(s, ["schema_version", "width", "height", "format", "pages"]);
  if (s.schema_version !== 1 || s.width !== 1080 || ![1080,1350,1920].includes(s.height as number) || !Array.isArray(s.pages) || !s.pages.length || s.pages.length > 10) invalid("khung thiết kế");
  const used = new Set<string>();
  const id = (value: unknown) => { const result = creativeId(value); if (used.has(result)) invalid("ID lớp/trang trùng"); used.add(result); return result; };
  const pages = s.pages.map(value => {
    const p = object(value); keys(p, ["id", "background", "layers"]);
    if (!Array.isArray(p.layers) || p.layers.length > 40) invalid("lớp thiết kế");
    const pageId = id(p.id);
    const layers = p.layers.map(value => {
      const l = object(value), type = choice(l.type, ["text", "shape", "image"]);
      keys(l, ["id", "type", "x", "y", "width", "height", "rotation", "opacity", "locked", ...(type === "text" ? ["text", "font_size", "font_family", "fill", "align"] : type === "shape" ? ["fill", "radius"] : ["asset_id", "fit", "role"])]);
      if (typeof l.locked !== "boolean") invalid("khóa lớp");
      const base = { id: id(l.id), x: number(l.x,-12000,12000), y: number(l.y,-12000,12000), width: number(l.width,1,12000), height: number(l.height,1,12000), rotation: number(l.rotation,-180,180), opacity: number(l.opacity,0,1), locked: l.locked };
      if (type === "text") return { ...base, type, text: text(l.text,2000,false,false), font_size: number(l.font_size,12,240), font_family: choice(l.font_family,["Arial","Georgia","system-ui"]), fill: color(l.fill), align: choice(l.align,["left","center","right"]) } satisfies CreativeLayer;
      if (type === "shape") return { ...base, type, fill: color(l.fill), radius: number(l.radius,0,500) } satisfies CreativeLayer;
      const fit = choice(l.fit,["contain","cover"]), role = choice(l.role,["photo","logo"]); if (role === "logo" && fit !== "contain") invalid("tỷ lệ logo");
      return { ...base, type, asset_id: creativeId(l.asset_id), fit, role } satisfies CreativeLayer;
    });
    return { id: pageId, background: color(p.background), layers };
  });
  return { schema_version: 1, width: 1080, height: s.height as number, format: choice(s.format,["graphic_carousel","photo_dump","hybrid"]), pages };
}
export function parseCreativeCommand(value: unknown): CreativeCommand {
  const c = object(value), action = c.action;
  if (action === "reserve_asset") {
    keys(c,["action","team_id","campaign_id","title","filename","mime_type","byte_size","width","height","reported_sha256","provenance","author","event","tags"]);
    const filename = text(c.filename,255,true); if (/[\x00-\x1f\x7f/\\]/.test(filename) || filename.startsWith(".") || filename.includes("..")) invalid("tên file");
    const width = number(c.width,16,12000,true), height = number(c.height,16,12000,true); if (width * height > 40000000) invalid("số pixel");
    if (typeof c.reported_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(c.reported_sha256)) invalid("digest");
    return { action, team_id: creativeId(c.team_id), campaign_id: nullableId(c.campaign_id), title: text(c.title,180,true), filename, mime_type: choice(c.mime_type,["image/png","image/jpeg"]), byte_size: number(c.byte_size,1,8388608,true), width, height, reported_sha256:c.reported_sha256, provenance: text(c.provenance,2000,true), author:text(c.author,200,true), event:text(c.event,200), tags:stringList(c.tags,20,80) };
  }
  if (action === "review_asset") {
    keys(c,["action","id","expected_version","rights","reason","allowed_channels","valid_until"]);
    const channels = stringList(c.allowed_channels,2,20).map(v=>choice(v,["facebook","internal"])); const rights=choice(c.rights,["needs_review","approved","internal_only","revoked"]);
    if (rights === "approved" && !channels.includes("facebook")) invalid("kênh được cấp quyền");
    return {action,id:creativeId(c.id),expected_version:version(c.expected_version),rights,reason:text(c.reason,2000,true),allowed_channels:channels,valid_until:timestamp(c.valid_until)};
  }
  if (action === "create_design" || action === "save_design") {
    keys(c,["action","title","scene",...(action === "create_design" ? ["content_id"] : ["id","expected_version"])]);
    const payload = { title:text(c.title,180,true), scene:parseCreativeScene(c.scene) };
    return action === "create_design" ? { action,...payload,content_id:creativeId(c.content_id) } : { action,...payload,id:creativeId(c.id),expected_version:version(c.expected_version) };
  }
  if (action === "create_variant") { keys(c,["action","id","expected_version","title"]); return {action,id:creativeId(c.id),expected_version:version(c.expected_version),title:text(c.title,180,true)}; }
  if (action === "restore_design") { keys(c,["action","id","expected_version","version_id"]); return {action,id:creativeId(c.id),expected_version:version(c.expected_version),version_id:creativeId(c.version_id)}; }
  if (action === "save_template") { keys(c,["action","design_id","expected_version","title","scope"]); return {action,design_id:creativeId(c.design_id),expected_version:version(c.expected_version),title:text(c.title,180,true),scope:choice(c.scope,["personal","team","campaign","official"])}; }
  if (action === "review_template") { keys(c,["action","id","expected_version","decision","reason"]); return {action,id:creativeId(c.id),expected_version:version(c.expected_version),decision:choice(c.decision,["approve","reject"]),reason:text(c.reason,2000,true)}; }
  if (action === "apply_template") { keys(c,["action","template_id","template_version","design_id","expected_version"]); return {action,template_id:creativeId(c.template_id),template_version:version(c.template_version),design_id:creativeId(c.design_id),expected_version:version(c.expected_version)}; }
  const transition=choice(action,["complete_asset","submit_template","prepare_export"]); keys(c,["action","id","expected_version"]); return {action:transition,id:creativeId(c.id),expected_version:version(c.expected_version)};
}
export function preflightDesign(design: Pick<CreativeDesign,"scene"|"team_id"|"campaign_id">, assets: readonly CreativeAsset[], now = Date.now()): CreativeIssue[] {
  const issues: CreativeIssue[] = [{code:"manual_review",severity:"warning",message:"Cần người kiểm tra thông tin, ngày/địa điểm/ưu đãi, chính tả, bản quyền, font/logo và bố cục. Preflight này không thay phê duyệt xuất bản."}];
  const seen = new Set<string>();
  for (const page of design.scene.pages) for (const layer of page.layers) {
    if (layer.x < 0 || layer.y < 0 || layer.x + layer.width > design.scene.width || layer.y + layer.height > design.scene.height) issues.push({code:"outside_canvas",severity:"warning",page_id:page.id,message:"Có lớp ra ngoài khung; kiểm tra vùng an toàn và crop."});
    if (layer.type !== "image") continue;
    const asset = assets.find(a=>a.id===layer.asset_id);
    if (!asset) { if (!seen.has(layer.asset_id)) issues.push({code:"asset_missing",severity:"blocker",asset_id:layer.asset_id,message:"Ảnh không có trong phạm vi truy cập."}); seen.add(layer.asset_id); continue; }
    if (!seen.has(asset.id) && (asset.team_id !== design.team_id || (asset.campaign_id && asset.campaign_id !== design.campaign_id) || asset.status !== "ready" || asset.rights !== "approved" || !asset.allowed_channels.includes("facebook") || (asset.valid_until && (!Number.isFinite(Date.parse(asset.valid_until)) || Date.parse(asset.valid_until) <= now)))) issues.push({code:"asset_rights",severity:"blocker",asset_id:asset.id,message:`Ảnh “${asset.title || asset.id}” thiếu quyền Facebook còn hiệu lực hoặc sai phạm vi Campaign.`});
    seen.add(asset.id);
    if (asset.width < layer.width || asset.height < layer.height) issues.push({code:"image_resolution",severity:"warning",asset_id:asset.id,page_id:page.id,message:"Ảnh có thể bị vỡ khi phóng lớn. Cần kiểm tra bản xuất."});
  }
  return issues;
}
