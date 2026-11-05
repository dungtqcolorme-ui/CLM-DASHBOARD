export type ConnectionStatus = "not_connected" | "connected" | "missing_scope" | "needs_app_review" | "token_expired" | "unsupported" | "connection_error";
export type MetaCapabilities = { read_posts: boolean; read_comments: boolean; organic_metrics: boolean; upload_media: boolean; publish: boolean; schedule: boolean; cancel: boolean };
export type MarketingConnection = { id:string; team_id:string; provider:"facebook"; page_id:string; page_name:string; graph_version:string; status:ConnectionStatus; capabilities:MetaCapabilities; verified_at:string|null; expires_at:string|null; confirmed_by:string; version:number; created_at:string; updated_at:string };
export type PublicationMode = "text" | "photo_dump" | "design";
export type PublicationIntent = { id:string; content_id:string; campaign_id:string; team_id:string; creator_id:string; connection_id:string; connection_version:number; content_version:number; design_id:string|null; mode:PublicationMode; final_asset_ids:string[]; scheduled_for:string; binding:{source_asset_ids:string[];asset_versions:Record<string,number>;design_version:number|null;[key:string]:unknown}; status:"pending_verification"|"sealed"|"approved"|"rejected"; snapshot:Record<string,unknown>|null; payload_hash:string|null; reviewer_id:string|null; reason:string; version:number; created_at:string; updated_at:string };
export type PublishingJobStatus = "queued"|"claimed"|"dispatching"|"remote_scheduled"|"published"|"cancelled"|"cancel_pending"|"unknown"|"failed"|"dead_letter";
export type PublishingJob = { id:string; team_id:string; campaign_id:string; content_id:string; candidate_id:string; approval_id:string; connection_id:string; status:PublishingJobStatus; scheduled_for:string; idempotency_key:string; attempts:number; next_attempt_at:string; lease_id:string|null; lease_until:string|null; remote_started_at:string|null; cancel_requested_at:string|null; remote_id:string|null; receipt:Record<string,unknown>|null; last_error:string|null; version:number; created_at:string; updated_at:string };
export type PublishingIncident = { id:string; team_id:string; campaign_id:string; content_id:string|null; job_id:string|null; kind:string; severity:"warning"|"critical"; message:string; status:"open"|"acknowledged"|"resolved"; dedupe_key:string; actor_id:string|null; version:number; created_at:string; updated_at:string };
export type PublishingEvent = { id:string; team_id:string; entity_type:string; entity_id:string; action:string; actor_id:string|null; snapshot:Record<string,unknown>; created_at:string };
export type PublishingWorkspace = { connections:MarketingConnection[]; candidates:PublicationIntent[]; jobs:PublishingJob[]; incidents:PublishingIncident[]; events:PublishingEvent[]; capabilities:{ gateway:"available"|"not_configured"; meta_oauth:"not_configured"|"unsupported"; live_publish:false; detail:string } };
export type PublishingCommand =
 | { action:"request_candidate"; content_id:string; expected_content_version:number; connection_id:string; mode:PublicationMode; design_id:string|null; final_asset_ids:string[]; scheduled_for:string }
 | { action:"approve_and_schedule"; id:string; expected_version:number; expected_hash:string; confirmed:true }
 | { action:"reject_candidate"; id:string; expected_version:number; reason:string }
 | { action:"cancel_job"; id:string; expected_version:number; reason:string }
 | { action:"acknowledge_incident"|"resolve_incident"; id:string; expected_version:number; reason:string };
export type MediaAttestation = { asset_id:string; asset_version:number; byte_size:number; sha256:string };
export type GatewayCommand =
 | {action:"seal_candidate"; id:string; expected_version:number; media:MediaAttestation[]}
 | {action:"save_connection"; actor_id:string; team_id:string; page_id:string; page_name:string; graph_version:string; capabilities:MetaCapabilities; verified_at:string; expires_at:string|null; credential_ciphertext:string; verification_reference:string}
 | {action:"revoke_connection"; actor_id:string; id:string; expected_version:number; reason:string}
 | {action:"read_credentials"; id:string}
 | {action:"list_reconciliation"; limit:number}
 | {action:"claim_job"; worker_id:string; lease_seconds:number}
 | {action:"inspect_job"; id:string; lease_id:string}
 | {action:"begin_dispatch"; id:string; lease_id:string}
 | {action:"complete_job"; id:string; lease_id:string; outcome:"published"|"remote_scheduled"|"unknown"|"failed"; remote_id:string|null; receipt:Record<string,unknown>; error:string|null}
 | {action:"reconcile_job"; id:string; expected_version:number; outcome:"published"|"remote_scheduled"|"cancelled"|"cancel_pending"|"unknown"|"failed"; remote_id:string|null; receipt:Record<string,unknown>}
 | {action:"release_job"; id:string; lease_id:string; reason:string};
