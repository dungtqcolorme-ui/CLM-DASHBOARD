"use client";

import type { TimelineCaption, TimelineClip, TimelineOverlay, VideoSource, VideoTimeline } from "@/lib/marketing/video-types";
import { Field } from "../components";
import { clipEnd, clipSpan, rounded, splitCaptions, splitClip, swapClips } from "./timeline-model";

function Numeric({ label, value, update, min = 0, max = 180, step = 0.01 }: { label: string; value: number; update: (n: number) => void; min?: number; max?: number; step?: number }) {
  return <Field label={label}><input type="number" min={min} max={max} step={step} value={value} onChange={(event) => {
    if (Number.isFinite(event.target.valueAsNumber)) update(event.target.valueAsNumber);
  }} /></Field>;
}

export function ClipControls({ timeline, sources, kind, selected, choose, time, edit, error, writable }: {
  timeline: VideoTimeline; sources: VideoSource[]; kind: "clips" | "audio"; selected: string;
  choose: (id: string) => void; time: number; edit: (timeline: VideoTimeline) => void; error: (message: string) => void; writable: boolean;
}) {
  const clips = timeline[kind];
  const index = clips.findIndex((clip) => clip.id === selected);
  const clip = clips[index];
  const source = sources.find((entry) => entry.id === clip?.source_id);
  function patch(values: Partial<TimelineClip>) {
    const next = { ...clip, ...values };
    edit({ ...timeline, duration: Math.min(180, Math.max(timeline.duration, clipEnd(next))), [kind]: clips.map((entry) => entry.id === clip.id ? next : entry) });
  }
  function move(offset: number) {
    try {
      const changed = swapClips(clips, index, index + offset);
      edit({ ...timeline, [kind]: changed });
    } catch (err) { error((err as Error).message); }
  }
  function split() {
    try {
      const at = rounded(time);
      const split = splitClip(clip, at, crypto.randomUUID());
      const captions = splitCaptions(timeline, clip, at, () => crypto.randomUUID());
      edit({ ...timeline, captions, [kind]: [...clips.slice(0, index), ...split, ...clips.slice(index + 1)] });
    } catch (err) { error((err as Error).message); }
  }
  return <section aria-label={kind === "clips" ? "Rãnh video" : "Rãnh âm thanh"}>
    <h4>{kind === "clips" ? "Rãnh video" : "Rãnh âm thanh"}</h4>
    <div className="mk-video-clips">{clips.map((entry, i) => <button key={entry.id} type="button" aria-pressed={selected === entry.id} onClick={() => choose(entry.id)}>
      {i + 1}. {sources.find((candidate) => candidate.id === entry.source_id)?.title ?? "Nguồn không khả dụng"} · {entry.start.toFixed(2)}–{clipEnd(entry).toFixed(2)} s{entry.locked ? " · Đã khóa" : ""}
    </button>)}</div>
    {!clips.length && <p className="mk-muted">Chưa có clip.</p>}
    {clip && <div className="mk-form">
      <div className="mk-actions">
        {writable && <><button type="button" onClick={() => patch({ locked: !clip.locked })}>{clip.locked ? "Mở khóa clip" : "Khóa clip"}</button>
          <button type="button" disabled={clip.locked} onClick={split}>Tách tại đầu phát</button>
          <button type="button" disabled={clip.locked || index === 0} onClick={() => move(-1)}>Đưa lên trước</button>
          <button type="button" disabled={clip.locked || index === clips.length - 1} onClick={() => move(1)}>Đưa ra sau</button>
          <button type="button" disabled={clip.locked} onClick={() => { edit({ ...timeline, [kind]: clips.filter((entry) => entry.id !== clip.id) }); choose(""); }}>Xóa clip</button></>}
      </div>
      <fieldset disabled={!writable || clip.locked} className="mk-form-grid">
        <Numeric label="Bắt đầu trên timeline (s)" value={clip.start} update={(start) => patch({ start })} />
        <Numeric label="Điểm vào nguồn (s)" value={clip.in_point} update={(in_point) => patch({ in_point })} max={source?.duration ?? 1800} />
        <Numeric label="Điểm ra nguồn (s)" value={clip.out_point} update={(out_point) => patch({ out_point })} max={source?.duration ?? 1800} />
        <Numeric label="Lớp (0–4)" value={clip.track} update={(track) => patch({ track })} max={4} step={1} />
        <Numeric label="Âm lượng (0–1)" value={clip.volume} update={(volume) => patch({ volume })} max={1} />
        <Numeric label="Tăng âm (s)" value={clip.fade_in} update={(fade_in) => patch({ fade_in })} max={clipSpan(clip)} />
        <Numeric label="Giảm âm (s)" value={clip.fade_out} update={(fade_out) => patch({ fade_out })} max={clipSpan(clip)} />
        <label><input type="checkbox" checked={clip.muted} onChange={(event) => patch({ muted: event.target.checked })} /> Tắt âm</label>
        {kind === "clips" && <>
          <Field label="Khớp khung"><select value={clip.fit} onChange={(event) => patch({ fit: event.target.value as TimelineClip["fit"] })}><option value="contain">Hiện toàn bộ</option><option value="cover">Lấp khung bằng crop</option></select></Field>
          <Numeric label="Vị trí crop ngang (0–1)" value={clip.position_x} update={(position_x) => patch({ position_x })} max={1} />
          <Numeric label="Vị trí crop dọc (0–1)" value={clip.position_y} update={(position_y) => patch({ position_y })} max={1} />
          <Field label="Chuyển cảnh"><select value={clip.transition} onChange={(event) => {
            const transition = event.target.value as TimelineClip["transition"];
            patch({ transition, transition_duration: transition === "cut" ? 0 : Math.min(0.25, clipSpan(clip)) });
          }}><option value="cut">Cắt thẳng</option><option value="dissolve">Hòa dần</option><option value="slide">Trượt</option></select></Field>
          <Numeric label="Thời lượng chuyển cảnh (s)" value={clip.transition_duration} update={(transition_duration) => patch({ transition_duration })} max={clip.transition === "cut" ? 0 : Math.min(1, clipSpan(clip))} />
        </>}
      </fieldset>
    </div>}
  </section>;
}

export function CaptionControls({ timeline, clip, edit, writable }: {
  timeline: VideoTimeline; clip?: TimelineClip; edit: (timeline: VideoTimeline) => void; writable: boolean;
}) {
  function patch(caption: TimelineCaption, values: Partial<TimelineCaption>) {
    edit({ ...timeline, captions: timeline.captions.map((entry) => entry.id === caption.id ? { ...entry, ...values } : entry) });
  }
  return <section>
    <h4>Phụ đề thủ công</h4>
    {writable && <button type="button" disabled={!clip || timeline.captions.length >= 200} onClick={() => {
      if (!clip) return;
      edit({ ...timeline, captions: [...timeline.captions, {
        id: crypto.randomUUID(), source_id: clip.source_id, start: clip.start, end: clipEnd(clip), text: "", manually_verified: false, locked: false,
      }] });
    }}>Thêm phụ đề cho clip đã chọn</button>}
    <div className="mk-phase-list">{timeline.captions.map((caption, index) => <div className="mk-phase-card" key={caption.id}>
      <strong>Phụ đề {index + 1} · {caption.manually_verified ? "Đã đối chiếu" : "Chưa đối chiếu"}</strong>
      <fieldset className="mk-form-grid" disabled={!writable || caption.locked}>
        <Field label="Nội dung phụ đề"><textarea value={caption.text} maxLength={1000} onChange={(e) => patch(caption, { text: e.target.value, manually_verified: false })} /></Field>
        <Numeric label="Phụ đề bắt đầu (s)" value={caption.start} max={timeline.duration} update={(start) => patch(caption, { start, manually_verified: false })} />
        <Numeric label="Phụ đề kết thúc (s)" value={caption.end} max={timeline.duration} update={(end) => patch(caption, { end, manually_verified: false })} />
        <label><input type="checkbox" checked={caption.manually_verified} onChange={(e) => patch(caption, { manually_verified: e.target.checked })} /> Đã đối chiếu với lời nói thật</label>
      </fieldset>
      {writable && <div className="mk-actions"><button type="button" onClick={() => patch(caption, { locked: !caption.locked })}>{caption.locked ? "Mở khóa phụ đề" : "Khóa phụ đề"}</button>
        <button type="button" disabled={caption.locked} onClick={() => edit({ ...timeline, captions: timeline.captions.filter((entry) => entry.id !== caption.id) })}>Xóa phụ đề</button></div>}
    </div>)}</div>
  </section>;
}

export function OverlayControls({ timeline, edit, writable }: { timeline: VideoTimeline; edit: (timeline: VideoTimeline) => void; writable: boolean }) {
  function patch(overlay: TimelineOverlay, values: Partial<TimelineOverlay>) {
    edit({ ...timeline, overlays: timeline.overlays.map((entry) => entry.id === overlay.id ? { ...entry, ...values } : entry) });
  }
  return <section>
    <h4>Lớp phủ</h4>
    {writable && <button type="button" disabled={timeline.overlays.length >= 100} onClick={() => edit({ ...timeline, overlays: [...timeline.overlays, {
      id: crypto.randomUUID(), type: "text", start: 0, end: timeline.duration, x: 40, y: 40, width: 500, height: 120,
      text: "", font_size: 50, fill: "#ffffff", opacity: 1, animation: "none", locked: false,
    }] })}>Thêm lớp phủ</button>}
    <div className="mk-phase-list">{timeline.overlays.map((overlay, index) => <div className="mk-phase-card" key={overlay.id}>
      <strong>Lớp phủ {index + 1}</strong>
      <fieldset disabled={!writable || overlay.locked} className="mk-form-grid">
        <Field label="Kiểu lớp phủ"><select value={overlay.type} onChange={(e) => patch(overlay, { type: e.target.value as TimelineOverlay["type"] })}><option value="text">Chữ</option><option value="shape">Hình chữ nhật</option></select></Field>
        <Field label="Chữ trên lớp phủ"><input value={overlay.text} maxLength={2000} onChange={(e) => patch(overlay, { text: e.target.value })} /></Field>
        <Numeric label="Lớp phủ bắt đầu (s)" value={overlay.start} max={timeline.duration} update={(start) => patch(overlay, { start })} />
        <Numeric label="Lớp phủ kết thúc (s)" value={overlay.end} max={timeline.duration} update={(end) => patch(overlay, { end })} />
        <Numeric label="Tọa độ ngang (px)" value={overlay.x} min={-12000} max={12000} step={1} update={(x) => patch(overlay, { x })} />
        <Numeric label="Tọa độ dọc (px)" value={overlay.y} min={-12000} max={12000} step={1} update={(y) => patch(overlay, { y })} />
        <Numeric label="Chiều rộng (px)" value={overlay.width} min={1} max={12000} step={1} update={(width) => patch(overlay, { width })} />
        <Numeric label="Chiều cao (px)" value={overlay.height} min={1} max={12000} step={1} update={(height) => patch(overlay, { height })} />
        <Numeric label="Cỡ chữ (px)" value={overlay.font_size} min={12} max={240} step={1} update={(font_size) => patch(overlay, { font_size })} />
        <Numeric label="Độ đục (0–1)" value={overlay.opacity} max={1} update={(opacity) => patch(overlay, { opacity })} />
        <Field label="Màu lớp phủ"><input type="color" value={overlay.fill} onChange={(e) => patch(overlay, { fill: e.target.value })} /></Field>
        <Field label="Hiệu ứng lớp phủ"><select value={overlay.animation} onChange={(e) => patch(overlay, { animation: e.target.value as TimelineOverlay["animation"] })}>
          <option value="none">Tĩnh</option><option value="fade">Hiện dần</option><option value="slide">Trượt vào</option><option value="scale">Phóng lên</option>
        </select></Field>
      </fieldset>
      {writable && <div className="mk-actions"><button type="button" onClick={() => patch(overlay, { locked: !overlay.locked })}>{overlay.locked ? "Mở khóa lớp phủ" : "Khóa lớp phủ"}</button>
        <button type="button" disabled={overlay.locked} onClick={() => edit({ ...timeline, overlays: timeline.overlays.filter((entry) => entry.id !== overlay.id) })}>Xóa lớp phủ</button></div>}
    </div>)}</div>
  </section>;
}
