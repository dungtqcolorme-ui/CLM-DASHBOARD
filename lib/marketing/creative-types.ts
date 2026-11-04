export type AssetRights = "needs_review" | "approved" | "internal_only" | "revoked";
export type CreativeAsset = {
  id: string; team_id: string; campaign_id: string | null; title: string; filename: string;
  mime_type: "image/png" | "image/jpeg"; byte_size: number; width: number; height: number;
  reported_sha256: string; storage_path: string; status: "pending_upload" | "ready";
  provenance: string; author: string; event: string; tags: string[];
  rights: AssetRights; rights_reason: string; allowed_channels: string[]; valid_until: string | null;
  creator_id: string; reviewer_id: string | null; reviewed_at: string | null;
  version: number; created_at: string; updated_at: string;
};
export type LayerBase = { id: string; x: number; y: number; width: number; height: number; rotation: number; opacity: number; locked: boolean };
export type CreativeLayer = LayerBase & (
  | { type: "text"; text: string; font_size: number; font_family: "Arial" | "Georgia" | "system-ui"; fill: string; align: "left" | "center" | "right" }
  | { type: "shape"; fill: string; radius: number }
  | { type: "image"; asset_id: string; fit: "cover" | "contain"; role: "photo" | "logo" }
);
export type CreativePage = { id: string; background: string; layers: CreativeLayer[] };
export type CreativeScene = { schema_version: 1; width: number; height: number; format: "graphic_carousel" | "photo_dump" | "hybrid"; pages: CreativePage[] };
export type CreativeDesign = {
  id: string; content_id: string; campaign_id: string; team_id: string; title: string;
  scene: CreativeScene; is_default: boolean; parent_design_id: string | null;
  creator_id: string; version: number; created_at: string; updated_at: string;
};
export type CreativeTemplate = {
  id: string; team_id: string; campaign_id: string | null; scope: "personal" | "team" | "campaign" | "official";
  title: string; scene: CreativeScene; status: "draft" | "pending" | "approved" | "rejected";
  creator_id: string; reviewer_id: string | null; reviewed_at: string | null; review_reason: string;
  version: number; created_at: string; updated_at: string;
};
export type CreativeVersion = { id: string; entity_type: "design" | "template"; entity_id: string; team_id: string; version: number; snapshot: unknown; actor_id: string; created_at: string };
export type CreativeWorkspace = { assets: CreativeAsset[]; designs: CreativeDesign[]; templates: CreativeTemplate[]; versions: CreativeVersion[]; capabilities: { drive: "not_connected"; image_upload: "available"; png_export: "available"; ai_design: "not_configured" } };
export type AssetReservationInput = Pick<CreativeAsset, "team_id" | "campaign_id" | "title" | "filename" | "mime_type" | "byte_size" | "width" | "height" | "reported_sha256" | "provenance" | "author" | "event" | "tags">;
export type CreativeCommand =
  | ({ action: "reserve_asset" } & AssetReservationInput)
  | { action: "complete_asset"; id: string; expected_version: number }
  | { action: "review_asset"; id: string; expected_version: number; rights: AssetRights; reason: string; allowed_channels: string[]; valid_until: string | null }
  | { action: "create_design"; content_id: string; title: string; scene: CreativeScene }
  | { action: "save_design"; id: string; expected_version: number; title: string; scene: CreativeScene }
  | { action: "create_variant"; id: string; expected_version: number; title: string }
  | { action: "restore_design"; id: string; expected_version: number; version_id: string }
  | { action: "save_template"; design_id: string; expected_version: number; title: string; scope: CreativeTemplate["scope"] }
  | { action: "submit_template"; id: string; expected_version: number }
  | { action: "review_template"; id: string; expected_version: number; decision: "approve" | "reject"; reason: string }
  | { action: "apply_template"; template_id: string; template_version: number; design_id: string; expected_version: number }
  | { action: "prepare_export"; id: string; expected_version: number };
export type CreativeIssue = { code: string; severity: "blocker" | "warning"; message: string; asset_id?: string; page_id?: string };
