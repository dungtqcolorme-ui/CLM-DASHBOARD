"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { utcToVietnamLocal, vietnamLocalToUtc } from "@/lib/marketing/domain";
import { parseVideoCommand } from "@/lib/marketing/video-domain";
import type { VideoCommand, VideoSource, VideoWorkspace } from "@/lib/marketing/video-types";
import { dateTime, Field, Panel } from "../components";
import { PrivateMedia } from "./playback";
import { useOperation, type usePhaseFive } from "./use-phase-five";

export type VideoAPI = ReturnType<typeof usePhaseFive<VideoWorkspace>>;
const mimeTypes = ["video/mp4", "video/webm", "audio/mpeg", "audio/wav"] as const;
const extensionMime = { mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav" };
const rightsLabels = { needs_review: "Chờ duyệt", approved: "Đã duyệt", internal_only: "Chỉ dùng nội bộ", revoked: "Đã thu hồi" };

async function fileMetadata(file: File) {
  const extension = file.name.split(".").at(-1)?.toLowerCase() as keyof typeof extensionMime;
  const type = file.type === "audio/x-wav" ? "audio/wav" : file.type || extensionMime[extension];
  const mime = mimeTypes.find((candidate) => candidate === type);
  if (!mime) throw Error("Chọn MP4, WebM, MP3 hoặc WAV.");
  const video = mime.startsWith("video/");
  if (file.size < 1 || file.size > (video ? 100 : 20) * 1024 * 1024) throw Error("Giới hạn video 100 MB và âm thanh 20 MB.");
  const objectUrl = URL.createObjectURL(file);
  const media = document.createElement(video ? "video" : "audio");
  try {
    const metadata = await new Promise<{ duration: number; width: number | null; height: number | null }>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(Error("Hết thời gian đọc thông tin nguồn.")), 8000);
      media.preload = "metadata";
      media.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve({ duration: media.duration, width: media instanceof HTMLVideoElement ? media.videoWidth : null, height: media instanceof HTMLVideoElement ? media.videoHeight : null });
      };
      media.onerror = () => { clearTimeout(timer); reject(Error("Trình duyệt không đọc được định dạng media.")); };
      media.src = objectUrl;
    });
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const reported_sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return { ...metadata, kind: video ? "video" as const : "audio" as const, mime_type: mime, byte_size: file.size, reported_sha256 };
  } finally {
    media.onloadedmetadata = null;
    media.onerror = null;
    media.removeAttribute("src");
    media.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function RightsReview({ source, api, update }: { source: VideoSource; api: VideoAPI; update: (source: VideoSource) => void }) {
  const op = useOperation();
  const [rights, setRights] = useState(source.rights);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const allowed_channels = form.getAll("channels").map(String);
    void op.run(async () => {
      const expiry = vietnamLocalToUtc(String(form.get("valid_until") || ""));
      if (rights === "approved" && (!expiry || new Date(expiry).getTime() <= Date.now())) throw Error("Quyền Facebook cần ngày hết hạn trong tương lai.");
      const result = await api.command<VideoSource>(parseVideoCommand({
        action: "review_video_source", id: source.id, expected_version: source.version,
        rights, reason: form.get("reason"), allowed_channels, valid_until: expiry,
      }));
      update(result);
    }, "Đã lưu duyệt quyền.");
  }
  return <details><summary>Duyệt quyền sử dụng</summary>
    <form className="mk-form" onSubmit={submit}>
      <fieldset disabled={op.pending}>
        <div className="mk-form-grid">
          <Field label="Quyết định quyền"><select value={rights} onChange={(event) => setRights(event.target.value as VideoSource["rights"])}>{Object.entries(rightsLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Hết hạn quyền (giờ Việt Nam)"><input name="valid_until" type="datetime-local" required={rights === "approved"} defaultValue={utcToVietnamLocal(source.valid_until)} /></Field>
        </div>
        <label><input name="channels" type="checkbox" value="facebook" defaultChecked={source.allowed_channels.includes("facebook")} /> Facebook</label>{" "}
        <label><input name="channels" type="checkbox" value="internal" defaultChecked={source.allowed_channels.includes("internal")} /> Nội bộ</label>
        <Field label="Lý do duyệt quyền"><textarea name="reason" required maxLength={2000} defaultValue={source.rights_reason} /></Field>
        <button type="submit">Lưu duyệt quyền</button>
      </fieldset>
    </form>
    {op.notice && <p role="status">{op.notice}</p>}
    {op.conflict && <button type="button" onClick={api.retry}>Tải quyết định quyền mới</button>}
  </details>;
}

export function SourcesPanel({ sources, teamId, campaignId, userId, canWrite, manager, api, update }: {
  sources: VideoSource[]; teamId: string; campaignId: string; userId: string; canWrite: boolean; manager: boolean; api: VideoAPI; update: (source: VideoSource) => void;
}) {
  const op = useOperation();
  const [preview, setPreview] = useState("");
  const [previewError, setPreviewError] = useState("");
  async function complete(source: VideoSource) {
    const saved = await api.command<VideoSource>({ action: "complete_video_source", id: source.id, expected_version: source.version } satisfies VideoCommand);
    update(saved);
  }
  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const file = form.get("file");
    if (!(file instanceof File)) return;
    void op.run(async () => {
      const assertCurrent = api.capture();
      const metadata = await fileMetadata(file);
      assertCurrent();
      const existing = sources.find((source) => source.status === "pending_upload" && source.creator_id === userId
        && source.campaign_id === campaignId && source.reported_sha256 === metadata.reported_sha256 && source.byte_size === metadata.byte_size
        && Date.parse(source.created_at) > Date.now() - 19 * 60000);
      const source = existing ?? await api.command<VideoSource>(parseVideoCommand({
        action: "reserve_video_source", team_id: teamId, campaign_id: campaignId,
        title: form.get("title"), provenance: form.get("provenance"), author: form.get("author"), ...metadata,
      }));
      update(source);
      const uploadFile = file.type === source.mime_type ? file : new File([file], file.name, { type: source.mime_type });
      const { error } = await getSupabaseClient().storage.from("marketing-footage").upload(source.storage_path, uploadFile, { upsert: false, contentType: source.mime_type });
      assertCurrent();
      if (error && !existing) throw Error("Chưa tải được tệp. Chọn lại cùng tệp để thử tiếp.");
      await complete(source);
      element.reset();
    }, "Đã tải nguồn riêng tư.");
  }
  return <Panel title="Nguồn video và âm thanh">
    {canWrite && <form className="mk-form" onSubmit={upload}>
      <fieldset disabled={op.pending}>
        <div className="mk-form-grid">
          <Field label="Tệp nguồn"><input name="file" type="file" accept={mimeTypes.join(",") + ",.mp4,.webm,.mp3,.wav"} required /></Field>
          <Field label="Tên nguồn"><input name="title" required maxLength={180} /></Field>
          <Field label="Tác giả nguồn"><input name="author" required maxLength={200} /></Field>
          <Field label="Xuất xứ nguồn"><input name="provenance" required maxLength={2000} /></Field>
        </div>
        <button className="mk-primary" type="submit">Tải nguồn riêng tư</button>
      </fieldset>
    </form>}
    {op.notice && <p role="status">{op.notice}</p>}
    {!sources.length && <p className="mk-muted">Chưa có nguồn trong phạm vi Campaign.</p>}
    <div className="mk-phase-list">{sources.map((source) => <article className="mk-phase-card" key={source.id}>
      <strong>{source.title} · v{source.version}</strong>
      <p>{source.author} · {source.provenance}</p>
      <p>{source.status === "ready" ? rightsLabels[source.rights] : "Đang chờ xác nhận tải lên"} · {source.duration.toFixed(2)} s</p>
      {source.valid_until && <p>Hết hạn {dateTime(source.valid_until)}</p>}
      {source.allowed_channels.length > 0 && <p>Kênh {source.allowed_channels.map((channel) => channel === "facebook" ? "Facebook" : "Nội bộ").join(", ")}</p>}
      {source.rights_reason && <p>{source.rights_reason}</p>}
      {source.status === "ready" && <button type="button" onClick={() => { setPreview(preview === source.id ? "" : source.id); setPreviewError(""); }}>{preview === source.id ? "Đóng xem nguồn" : "Xem nguồn"}</button>}
      {source.status === "pending_upload" && canWrite && source.creator_id === userId && <button type="button" disabled={op.pending} onClick={() => void op.run(() => complete(source), "Đã xác nhận tải nguồn.")}>Xác nhận tệp đã tải</button>}
      {preview === source.id && <div className="mk-private-source"><PrivateMedia key={source.version} source={source} request={api.request} onError={setPreviewError} />{previewError && <p role="alert">{previewError}</p>}</div>}
      {manager && source.status === "ready" && <RightsReview key={source.version} source={source} api={api} update={update} />}
    </article>)}</div>
  </Panel>;
}
