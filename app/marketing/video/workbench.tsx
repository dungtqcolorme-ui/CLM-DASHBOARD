"use client";

import { useEffect, useState } from "react";
import { parseVideoCommand, videoPreflight } from "@/lib/marketing/video-domain";
import type { MarketingContent } from "@/lib/marketing/types";
import type { VideoCommand, VideoProject, VideoRenderJob, VideoSource, VideoWorkspace } from "@/lib/marketing/video-types";
import { dateTime, Field, Panel } from "../components";
import { useMarketing } from "../workspace";
import { TimelinePlayback } from "./playback";
import { SourcesPanel, type VideoAPI } from "./sources";
import { CaptionControls, ClipControls, OverlayControls } from "./timeline-controls";
import { appendClip, aspects, blankTimeline } from "./timeline-model";
import { useOperation, usePhaseFive, useVersionedDraft } from "./use-phase-five";
import { phaseFiveCanWriteTeam } from "./access-scope";

type ProjectDraft = Pick<VideoProject, "title" | "timeline" | "version">;

function TimelineEditor({ project, sources, workspace, api, userId, accessVersion, writable, update, updateJob, choose }: {
  project: VideoProject; sources: VideoSource[]; workspace: VideoWorkspace; api: VideoAPI; userId: string; accessVersion: number; writable: boolean;
  update: (project: VideoProject) => void; updateJob: (job: VideoRenderJob) => void; choose: (id: string) => void;
}) {
  const [cachedDraft, setDraft] = useVersionedDraft<ProjectDraft>(userId + "/video/" + project.id, accessVersion);
  const draft = writable ? cachedDraft : null;
  const [historyId, setHistoryId] = useState("");
  const [time, setTime] = useState(0);
  const [sourceId, setSourceId] = useState("");
  const [clipId, setClipId] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  const op = useOperation();
  const history = workspace.versions.filter((version) => version.project_id === project.id).sort((a, b) => b.version - a.version);
  const historical = history.find((version) => version.id === historyId);
  const current = draft ?? project;
  const timeline = historical?.timeline ?? current.timeline;
  const canEdit = writable && !historical && !op.pending;
  const selected = [...timeline.clips, ...timeline.audio].find((clip) => clip.id === clipId);
  const addable = sources.filter((source) => source.status === "ready" && source.rights !== "revoked" && (!source.valid_until || Date.parse(source.valid_until) > now));
  const issues = videoPreflight(project, sources, now);
  const jobs = workspace.jobs.filter((job) => job.project_id === project.id);
  const conflict = !!draft && (op.conflict || draft.version !== project.version);

  function edit(next: Partial<ProjectDraft>) {
    setMessage("");
    setDraft({ title: current.title, timeline: current.timeline, version: current.version, ...next });
  }
  async function change(command: VideoCommand) {
    const result = await api.command<VideoProject>(parseVideoCommand(command));
    update(result);
    return result;
  }
  function save() {
    void op.run(async () => {
      await change({ action: "save_video_project", id: project.id, expected_version: current.version, title: current.title, timeline: current.timeline });
      setDraft(null);
    }, "Đã lưu timeline.");
  }
  function add() {
    const source = addable.find((entry) => entry.id === sourceId);
    if (!source) return;
    try {
      const id = crypto.randomUUID();
      const next = appendClip(timeline, source, id);
      edit({ timeline: next });
      setClipId(id);
      setTime(next[source.kind === "video" ? "clips" : "audio"].at(-1)?.start ?? 0);
    } catch (error) { setMessage((error as Error).message); }
  }
  function variant() {
    void op.run(async () => {
      const next = await change({ action: "create_video_variant", id: project.id, expected_version: project.version, title: (project.title.slice(0, 155) + " · Biến thể") });
      choose(next.id);
    });
  }
  function restore() {
    if (!historical) return;
    void op.run(async () => {
      await change({ action: "restore_video_project", id: project.id, expected_version: project.version, version_id: historical.id });
      setHistoryId("");
    }, "Đã khôi phục thành phiên bản mới.");
  }

  return <Panel title="Biên tập timeline">
    <div className="mk-phase-work">
      <div className="mk-stack">
        <p>Bản lưu v{project.version}{historical ? " · Đang xem lịch sử v" + historical.version : draft ? " · Bản nháp từ v" + draft.version : ""}</p>
        <TimelinePlayback key={historical?.id ?? project.id} timeline={timeline} sources={sources} time={time} setTime={setTime} request={api.request} />
        <Field label="Lịch sử timeline"><select value={historyId} onChange={(e) => { setHistoryId(e.target.value); setTime(0); setClipId(""); }}>
          <option value="">Timeline làm việc</option>
          {history.map((version) => <option key={version.id} value={version.id}>v{version.version} · {dateTime(version.created_at)}</option>)}
        </select></Field>
        {draft && !conflict && <button type="button" disabled={op.pending} onClick={() => { setDraft(null); setClipId(""); setMessage(""); }}>Bỏ bản nháp timeline</button>}
        {historical && writable && <button type="button" disabled={!!draft || op.pending} onClick={restore}>Khôi phục timeline này</button>}
      </div>
      <div className="mk-form">
        {!historical && <fieldset disabled={!canEdit}>
          <div className="mk-form-grid">
            <Field label="Tên timeline"><input value={current.title} maxLength={180} onChange={(e) => edit({ title: e.target.value })} /></Field>
            <Field label="Tỷ lệ khung"><select value={timeline.width + "x" + timeline.height} onChange={(e) => {
              const [width, height] = e.target.value.split("x").map(Number);
              edit({ timeline: { ...timeline, width, height } });
            }}>{aspects.map(([width, height, label]) => <option key={label} value={width + "x" + height}>{label} · {width}×{height}</option>)}</select></Field>
            <Field label="Thời lượng timeline (s)"><input type="number" min={0.1} max={180} step={0.01} value={timeline.duration} onChange={(e) => {
              if (e.target.valueAsNumber > 0) edit({ timeline: { ...timeline, duration: e.target.valueAsNumber } });
            }} /></Field>
            <Field label="Nguồn cho clip"><select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Chọn nguồn</option>{addable.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
            </select></Field>
          </div>
          {writable && <div className="mk-actions">
            <button type="button" onClick={add} disabled={!sourceId}>Thêm clip</button>
            <button type="button" className="mk-primary" disabled={!draft || conflict} onClick={save}>Lưu timeline</button>
            <button type="button" disabled={!!draft} onClick={variant}>Tạo biến thể tỷ lệ</button>
          </div>}
        </fieldset>}
        {conflict && <div className="mk-notice" role="alert">
          <p>Bản nháp dựa trên v{draft.version}. Phiên bản đang tải là v{project.version}.</p>
          <div className="mk-actions">
            <button type="button" onClick={api.retry}>Tải timeline máy chủ</button>
            <button type="button" disabled={draft.version === project.version || !canEdit} onClick={() => void op.run(async () => {
              setDraft(null);
              setClipId("");
            })}>Bỏ bản nháp và dùng v{project.version}</button>
          </div>
        </div>}
        {(op.notice || message) && <p role="status">{message || op.notice}</p>}
        {op.conflict && !draft && <button type="button" onClick={api.retry}>Tải timeline máy chủ</button>}
        <ClipControls timeline={timeline} sources={sources} kind="clips" selected={clipId} choose={setClipId} time={time} edit={(next) => edit({ timeline: next })} error={setMessage} writable={canEdit} />
        <ClipControls timeline={timeline} sources={sources} kind="audio" selected={clipId} choose={setClipId} time={time} edit={(next) => edit({ timeline: next })} error={setMessage} writable={canEdit} />
        <CaptionControls timeline={timeline} clip={selected} edit={(next) => edit({ timeline: next })} writable={canEdit} />
        <OverlayControls timeline={timeline} edit={(next) => edit({ timeline: next })} writable={canEdit} />
      </div>
    </div>
    <section className="mk-phase-card">
      <h3>Xuất video · NotConfigured</h3>
      <p>Render, phiên âm và AI dựng thô chưa cấu hình. Bản xem trong trình duyệt dành cho biên tập.</p>
      {[...new Set(issues.filter((issue) => issue.severity === "blocker").map((issue) => issue.message))].map((issue) => <p key={issue}>{issue}</p>)}
      {writable && <button type="button" disabled={op.pending || !!draft || !!historical || !project.timeline.clips.length || issues.some((issue) => issue.severity === "blocker")} onClick={() => void op.run(async () => {
        updateJob(await api.command<VideoRenderJob>({ action: "request_video_render", id: project.id, expected_version: project.version } satisfies VideoCommand));
      }, "Đã ghi yêu cầu. Worker render chưa cấu hình.")}>Ghi yêu cầu render</button>}
      {jobs.map((job) => <div key={job.id} className="mk-phase-card">
        <strong>Render v{job.project_version} · {job.status === "not_configured" ? "NotConfigured" : job.status === "cancelled" ? "Đã hủy" : job.status}</strong>
        {job.status === "not_configured" && <p>Chưa cấu hình worker. Chưa có tệp kết quả.</p>}
        {writable && job.status === "not_configured" && <form className="mk-form" onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void op.run(async () => {
            updateJob(await api.command<VideoRenderJob>(parseVideoCommand({ action: "cancel_video_render", id: job.id, expected_version: job.version, reason: form.get("reason") })));
          }, "Đã hủy yêu cầu render.");
        }}>
          <Field label="Lý do hủy render"><input name="reason" maxLength={2000} required /></Field>
          <button type="submit" disabled={op.pending}>Hủy yêu cầu render</button>
        </form>}
      </div>)}
    </section>
  </Panel>;
}

function replace<T extends { id: string; version: number }>(rows: T[], row: T) {
  return rows.some((entry) => entry.id === row.id) ? rows.map((entry) => entry.id === row.id && row.version >= entry.version ? row : entry) : [row, ...rows];
}

function VideoWorkspaceView({ item, userId, accessVersion }: { item: MarketingContent; userId: string; accessVersion: number }) {
  const { data, canWrite, manager, refresh } = useMarketing();
  const api = usePhaseFive<VideoWorkspace>("video", userId, accessVersion);
  const [projectId, setProjectId] = useState("");
  const op = useOperation();
  const workspace = api.data;
  if (!workspace) return <div aria-live="polite"><p>{api.error || "Đang tải video…"}</p>{api.error && <button type="button" onClick={api.retry}>Thử tải lại video</button>}</div>;
  const campaign = data.campaigns.find((entry) => entry.id === item.campaign_id);
  const teamWriter = canWrite && phaseFiveCanWriteTeam(data, item.team_id);
  const writable = teamWriter && ["draft", "active"].includes(campaign?.status ?? "") && ["draft", "changes_requested"].includes(item.publishing_status);
  const projects = workspace.projects.filter((project) => project.content_id === item.id);
  const project = projects.find((entry) => entry.id === projectId) ?? projects.find((entry) => entry.is_default) ?? projects[0];
  const sources = workspace.sources.filter((source) => source.team_id === item.team_id && (!source.campaign_id || source.campaign_id === item.campaign_id));
  function updateProject(next: VideoProject) {
    api.setData((previous) => previous && { ...previous, projects: replace(previous.projects, next) });
    void refresh().catch(() => {});
    api.retry();
  }
  return <div className="mk-phase mk-stack">
    {api.error && <p role="alert">{api.error}</p>}
    <SourcesPanel sources={sources} teamId={item.team_id} campaignId={item.campaign_id} userId={userId} canWrite={teamWriter} manager={teamWriter && manager} api={api}
      update={(next: VideoSource) => api.setData((previous) => previous && { ...previous, sources: replace(previous.sources, next) })} />
    {!project && <Panel title="Timeline"><p>Chưa tạo timeline cho nội dung này.</p>{writable && <button type="button" disabled={op.pending} onClick={() => void op.run(async () => {
      const next = await api.command<VideoProject>(parseVideoCommand({ action: "create_video_project", content_id: item.id, title: item.title, timeline: blankTimeline }));
      updateProject(next);
      setProjectId(next.id);
    })}>Tạo timeline</button>}{op.notice && <p role="status">{op.notice}</p>}</Panel>}
    {project && <>
      <Field label="Timeline / biến thể"><select value={project.id} onChange={(e) => setProjectId(e.target.value)}>{projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.title} · v{entry.version}</option>)}</select></Field>
      <TimelineEditor key={project.id} project={project} sources={sources} workspace={workspace} api={api} writable={writable} userId={userId} accessVersion={accessVersion} update={updateProject} choose={setProjectId}
        updateJob={(next) => api.setData((previous) => previous && { ...previous, jobs: replace(previous.jobs, next) })} />
    </>}
  </div>;
}

export default function VideoWorkbench({ item }: { item: MarketingContent }) {
  const { data, phaseFiveAccessVersion } = useMarketing();
  const [open, setOpen] = useState(false);
  return <Panel title="Video Timeline Studio" action={<button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Đóng Video Studio" : "Mở Video Studio"}</button>}>
    {open ? <VideoWorkspaceView key={phaseFiveAccessVersion + "/" + item.id} item={item} userId={data.profile.id} accessVersion={phaseFiveAccessVersion} /> : <p className="mk-muted">Tải nguồn riêng tư, duyệt quyền và biên tập timeline cho nội dung này.</p>}
  </Panel>;
}
