"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { TimelineClip, TimelineOverlay, VideoSource, VideoTimeline, VideoWorkspace } from "@/lib/marketing/video-types";
import { activeClips, clipEnd, previewDeadlines, rounded, sourceTime } from "./timeline-model";
import type { usePhaseFive } from "./use-phase-five";

type Request = ReturnType<typeof usePhaseFive<VideoWorkspace>>["request"];
type PrivateProps = { source: VideoSource; request: Request; clip?: TimelineClip; time?: number; playing?: boolean; onError: (message: string) => void; onReady?: (ready: boolean) => void };

export function PrivateMedia({ source, request, clip, time = 0, playing = false, onError, onReady }: PrivateProps) {
  const media = useRef<HTMLMediaElement | null>(null);
  const [revision, setRevision] = useState(0);
  const playback = useRef({ time, playing, clip });
  const callbacks = useRef({ onError, onReady });
  useEffect(() => { callbacks.current = { onError, onReady }; }, [onError, onReady]);
  useEffect(() => { playback.current = { time, playing, clip }; }, [time, playing, clip]);

  useEffect(() => {
    const el = media.current;
    if (!el) return;
    let live = true;
    let renewTimer: number;
    let cutoffTimer: number;
    let cutoff = Infinity;
    const rightsUntil = source.valid_until ? Date.parse(source.valid_until) : Infinity;
    let position = 0;
    let resume = false;

    function align() {
      if (!el) return;
      const state = playback.current;
      el.currentTime = state.clip ? sourceTime(state.clip, state.time) : Math.min(position, el.duration);
      if (state.clip) {
        el.muted = state.clip.muted;
        el.volume = previewVolume(state.clip, state.time);
      }
      if (state.clip ? state.playing : resume) void el.play().catch(() => callbacks.current.onError("Trình duyệt chưa thể phát nguồn này."));
    }
    function clearSource() {
      el?.pause();
      el?.removeAttribute("src");
      el?.load();
    }
    function expire() {
      if (!el?.hasAttribute("src")) return;
      position = el.currentTime;
      resume = false;
      clearSource();
      callbacks.current.onReady?.(false);
      callbacks.current.onError("Phiên xem nguồn đã hết hạn.");
    }
    function checkCutoff() {
      if (performance.now() >= cutoff || Date.now() >= rightsUntil) expire();
    }
    function ready() {
      checkCutoff();
      if (el?.hasAttribute("src")) callbacks.current.onReady?.(true);
    }
    async function load() {
      const requestedAt = performance.now();
      try {
        const response = await request("/api/marketing/video/source?" + new URLSearchParams({ id: source.id }));
        const signed = await response.json() as { url: string; expires_in: number; source_version: number };
        if (!live || !el) return;
        if (signed.source_version !== source.version) throw Error("Quyền nguồn đã thay đổi. Tải lại dữ liệu video.");
        const now = performance.now();
        const deadlines = previewDeadlines(requestedAt, now, Date.now(), signed.expires_in, rightsUntil);
        if (!deadlines) throw Error("Phiên xem nguồn đã hết hạn.");
        if (el.hasAttribute("src")) {
          position = el.currentTime;
          resume = !el.paused;
        }
        clearTimeout(cutoffTimer);
        cutoff = deadlines.cutoff;
        cutoffTimer = window.setTimeout(expire, Math.max(0, cutoff - now));
        callbacks.current.onReady?.(false);
        el.src = signed.url;
        if (deadlines.refresh !== null) renewTimer = window.setTimeout(() => void load(), Math.max(0, deadlines.refresh - now));
      } catch (error) {
        if (!live) return;
        clearTimeout(cutoffTimer);
        clearSource();
        callbacks.current.onReady?.(false);
        callbacks.current.onError(error instanceof Error ? error.message : "Không tải được nguồn riêng tư.");
      }
    }
    function fail() {
      if (live && el?.hasAttribute("src")) callbacks.current.onError("Trình duyệt không giải mã được nguồn này.");
    }
    el.addEventListener("loadedmetadata", align);
    el.addEventListener("canplay", ready);
    el.addEventListener("error", fail);
    el.addEventListener("playing", checkCutoff);
    el.addEventListener("timeupdate", checkCutoff);
    document.addEventListener("visibilitychange", checkCutoff);
    void load();
    return () => {
      live = false;
      clearTimeout(renewTimer);
      clearTimeout(cutoffTimer);
      el.removeEventListener("loadedmetadata", align);
      el.removeEventListener("canplay", ready);
      callbacks.current.onReady?.(false);
      el.removeEventListener("error", fail);
      el.removeEventListener("playing", checkCutoff);
      el.removeEventListener("timeupdate", checkCutoff);
      document.removeEventListener("visibilitychange", checkCutoff);
      clearSource();
    };
  }, [request, source.id, source.version, source.valid_until, revision]);

  useEffect(() => {
    const el = media.current;
    if (!el || !clip || !el.hasAttribute("src") || el.readyState < 1) return;
    const current = sourceTime(clip, time);
    el.volume = previewVolume(clip, time);
    el.muted = clip.muted;
    if (!playing || Math.abs(el.currentTime - current) > 0.18) {
      if (Math.abs(el.currentTime - current) > 0.008) el.currentTime = current;
    }
    if (playing && el.paused) void el.play().catch(() => {});
    if (!playing) el.pause();
  }, [clip, playing, time]);

  const ref = (node: HTMLMediaElement | null) => { media.current = node; };
  const blend = clip?.transition_duration ? Math.max(0, Math.min(1, (time - clip.start) / clip.transition_duration)) : 1;
  const style = clip ? {
    objectFit: clip.fit,
    objectPosition: (clip.position_x * 100) + "% " + (clip.position_y * 100) + "%",
    opacity: clip.transition === "dissolve" ? blend : 1,
    transform: clip.transition === "slide" ? "translateX(" + ((1 - blend) * 100) + "%)" : undefined,
  } : undefined;
  return <>
    {source.kind === "video"
      ? <video ref={ref} controls={!clip} playsInline preload="auto" style={style} aria-label={clip ? "Video trên timeline" : "Xem nguồn riêng tư"} />
      : <audio ref={ref} controls={!clip} preload="auto" aria-label={clip ? "Âm thanh trên timeline" : "Nghe nguồn riêng tư"} />}
    {!clip && <button type="button" onClick={() => setRevision((n) => n + 1)}>Tải lại bản xem nguồn</button>}
  </>;
}

function previewVolume(clip: TimelineClip, time: number) {
  const current = sourceTime(clip, time);
  const fadeIn = clip.fade_in ? Math.min(1, (current - clip.in_point) / clip.fade_in) : 1;
  const fadeOut = clip.fade_out ? Math.min(1, (clip.out_point - current) / clip.fade_out) : 1;
  return Math.min(1, Math.max(0, clip.volume * fadeIn * fadeOut));
}

function Overlay({ overlay, time, timeline }: { overlay: TimelineOverlay; time: number; timeline: VideoTimeline }) {
  const entry = Math.min(1, (time - overlay.start) / 0.3);
  const percent = (value: number, total: number) => (value / total * 100) + "%";
  return <div className="mk-video-overlay" style={{
    left: percent(overlay.x, timeline.width), top: percent(overlay.y, timeline.height),
    width: percent(overlay.width, timeline.width), height: percent(overlay.height, timeline.height),
    fontSize: (overlay.font_size / timeline.width * 100) + "cqw",
    opacity: overlay.opacity * (overlay.animation === "fade" ? entry : 1),
    color: overlay.fill, background: overlay.type === "shape" ? overlay.fill : undefined,
    transform: overlay.animation === "slide" ? "translateX(" + ((1 - entry) * 50) + "%)" : overlay.animation === "scale" ? "scale(" + entry + ")" : undefined,
  }}>{overlay.type === "text" ? overlay.text : null}</div>;
}

export function TimelinePlayback({ timeline, sources, time, setTime, request }: { timeline: VideoTimeline; sources: VideoSource[]; time: number; setTime: (time: number) => void; request: Request }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const cursor = useRef(time);
  const at = Math.min(time, timeline.duration);
  const videos = activeClips(timeline.clips, at);
  const audio = activeClips(timeline.audio, at);
  const active = [...videos, ...audio].flatMap((clip) => {
    const source = sources.find((candidate) => candidate.id === clip.source_id);
    return source ? [{ clip, source, key: clip.id + "/" + source.version }] : [];
  });
  const waiting = active.some(({ key }) => !ready.has(key));
  function readyChanged(key: string, value: boolean) {
    setReady((previous) => {
      if (previous.has(key) === value) return previous;
      const next = new Set(previous);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }
  useEffect(() => { cursor.current = time; }, [time]);
  useEffect(() => {
    if (!playing || waiting) return;
    let frame: number;
    let previous = performance.now();
    function tick(now: number) {
      const next = Math.min(timeline.duration, cursor.current + Math.min(100, now - previous) / 1000);
      previous = now;
      cursor.current = next;
      setTime(next);
      if (next >= timeline.duration) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, setTime, timeline.duration, waiting]);
  const selected = timeline.captions.filter((caption) => caption.start <= at && caption.end > at);
  return <>
    <div className="mk-video-stage" style={{ aspectRatio: timeline.width + "/" + timeline.height, "--mk-stage-max": (32 * timeline.width / timeline.height) + "rem" } as CSSProperties} aria-label="Khung xem timeline">
      {active.map(({ clip, source, key }) => <PrivateMedia key={key} source={source} clip={clip} time={at} playing={playing && !waiting}
        request={request} onReady={(value) => readyChanged(key, value)} onError={(message) => { setPlaying(false); setError(message); }} />)}
      {!videos.length && <p>{at >= timeline.duration && timeline.clips.some((clip) => clipEnd(clip) === timeline.duration) ? "Hết timeline" : "Khoảng trống video"}</p>}
      {timeline.overlays.filter((o) => o.start <= at && o.end > at).map((overlay) => <Overlay key={overlay.id} overlay={overlay} time={at} timeline={timeline} />)}
      {!!selected.length && <div className="mk-video-caption">{selected.map((caption) => <span key={caption.id}>{caption.text}</span>)}</div>}
    </div>
    <div className="mk-actions">
      <button type="button" onClick={() => {
        setError("");
        if (!playing && time >= timeline.duration) setTime(0);
        setPlaying(!playing);
      }}>{playing ? "Tạm dừng timeline" : "Phát timeline"}</button>
      {playing && waiting && <span role="status">Đang đọc nguồn media…</span>}
      <output aria-label="Vị trí đầu phát">{at.toFixed(2)} / {timeline.duration.toFixed(2)} s</output>
    </div>
    <label className="mk-phase-field">Đầu phát<input type="range" min={0} max={timeline.duration} step={0.01} value={rounded(at)} onChange={(e) => { setError(""); setTime(e.target.valueAsNumber); }} /></label>
    {error && <p role="alert">{error}</p>}
  </>;
}
