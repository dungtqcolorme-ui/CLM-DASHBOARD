export type VideoSource = {id:string;team_id:string;campaign_id:string|null;title:string;kind:"video"|"audio";mime_type:"video/mp4"|"video/webm"|"audio/mpeg"|"audio/wav";byte_size:number;reported_sha256:string;duration:number;width:number|null;height:number|null;storage_path:string;status:"pending_upload"|"ready";provenance:string;author:string;rights:"needs_review"|"approved"|"internal_only"|"revoked";allowed_channels:string[];valid_until:string|null;rights_reason:string;creator_id:string;reviewer_id:string|null;version:number;created_at:string;updated_at:string};
export type TimelineClip = {id:string;source_id:string;track:number;start:number;in_point:number;out_point:number;volume:number;muted:boolean;fade_in:number;fade_out:number;fit:"contain"|"cover";position_x:number;position_y:number;transition:"cut"|"dissolve"|"slide";transition_duration:number;locked:boolean};
export type TimelineOverlay = {id:string;type:"text"|"shape";start:number;end:number;x:number;y:number;width:number;height:number;text:string;font_size:number;fill:string;opacity:number;animation:"none"|"fade"|"slide"|"scale";locked:boolean};
export type TimelineCaption = {id:string;source_id:string;start:number;end:number;text:string;manually_verified:boolean;locked:boolean};
export type VideoTimeline = {schema_version:1;width:number;height:number;duration:number;clips:TimelineClip[];audio:TimelineClip[];overlays:TimelineOverlay[];captions:TimelineCaption[]};
export type VideoProject = {id:string;team_id:string;campaign_id:string;content_id:string;title:string;timeline:VideoTimeline;is_default:boolean;parent_project_id:string|null;creator_id:string;version:number;created_at:string;updated_at:string};
export type VideoVersion = {id:string;team_id:string;project_id:string;version:number;timeline:VideoTimeline;actor_id:string;created_at:string};
export type VideoRenderJob = {id:string;team_id:string;project_id:string;project_version:number;status:"not_configured"|"queued"|"claimed"|"rendering"|"completed"|"failed"|"cancelled";progress:number|null;output_asset_id:string|null;error:string|null;creator_id:string;version:number;created_at:string;updated_at:string};
export type VideoWorkspace={sources:VideoSource[];projects:VideoProject[];versions:VideoVersion[];jobs:VideoRenderJob[];capabilities:{render:"not_configured";transcription:"not_configured";ai_rough_cut:"not_configured"}};
export type VideoCommand=
 | {action:"reserve_video_source";team_id:string;campaign_id:string|null;title:string;kind:VideoSource["kind"];mime_type:VideoSource["mime_type"];byte_size:number;reported_sha256:string;duration:number;width:number|null;height:number|null;provenance:string;author:string}
 | {action:"complete_video_source";id:string;expected_version:number}
 | {action:"review_video_source";id:string;expected_version:number;rights:VideoSource["rights"];reason:string;allowed_channels:string[];valid_until:string|null}
 | {action:"create_video_project";content_id:string;title:string;timeline:VideoTimeline}
 | {action:"save_video_project";id:string;expected_version:number;title:string;timeline:VideoTimeline}
 | {action:"create_video_variant";id:string;expected_version:number;title:string}
 | {action:"restore_video_project";id:string;expected_version:number;version_id:string}
 | {action:"request_video_render";id:string;expected_version:number}
 | {action:"cancel_video_render";id:string;expected_version:number;reason:string};
