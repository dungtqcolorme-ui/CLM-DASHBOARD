import type { TimelineClip, VideoSource, VideoTimeline } from "@/lib/marketing/video-types";

export const aspects = [[1920, 1080, "16:9"], [1080, 1920, "9:16"], [1080, 1350, "4:5"], [1080, 1080, "1:1"]] as const;
export const blankTimeline: VideoTimeline = { schema_version: 1, width: 1920, height: 1080, duration: 3, clips: [], audio: [], overlays: [], captions: [] };
export const rounded = (n: number) => Number(n.toFixed(4));
export const clipSpan = (clip: TimelineClip) => rounded(clip.out_point - clip.in_point);
export const clipEnd = (clip: TimelineClip) => rounded(clip.start + clipSpan(clip));
export const sourceTime = (clip: TimelineClip, time: number) => rounded(clip.in_point + Math.min(clipSpan(clip), Math.max(0, time - clip.start)));

export function activeClips(clips: TimelineClip[], time: number) {
  return clips.filter((clip) => time >= clip.start && time < clipEnd(clip)).sort((a, b) => a.track - b.track);
}

export function appendClip(timeline: VideoTimeline, source: VideoSource, id: string): VideoTimeline {
  const key = source.kind === "video" ? "clips" : "audio";
  const start = Math.max(0, ...timeline[key].map(clipEnd));
  const duration = Math.min(source.duration, 180 - start);
  if (duration < 0.01 || timeline.clips.length + timeline.audio.length >= 100) throw Error("Timeline đã đạt giới hạn clip hoặc thời lượng.");
  const clip: TimelineClip = {
    id, source_id: source.id, track: 0, start, in_point: 0, out_point: duration,
    volume: 1, muted: false, fade_in: 0, fade_out: 0, fit: "contain", position_x: 0.5, position_y: 0.5,
    transition: "cut", transition_duration: 0, locked: false,
  };
  return { ...timeline, duration: Math.max(timeline.duration, clipEnd(clip)), [key]: [...timeline[key], clip] };
}

export function splitClip(clip: TimelineClip, time: number, id: string): [TimelineClip, TimelineClip] {
  const middle = sourceTime(clip, time);
  if (clip.locked || middle <= clip.in_point || middle >= clip.out_point) throw Error("Đặt đầu phát bên trong clip chưa khóa để tách.");
  const leftSpan = rounded(middle - clip.in_point);
  const rightSpan = rounded(clip.out_point - middle);
  return [
    { ...clip, out_point: middle, fade_in: Math.min(clip.fade_in, leftSpan), fade_out: 0, transition_duration: Math.min(clip.transition_duration, leftSpan) },
    { ...clip, id, start: rounded(time), in_point: middle, fade_in: 0, fade_out: Math.min(clip.fade_out, rightSpan), transition: "cut", transition_duration: 0 },
  ];
}

export function swapClips(clips: TimelineClip[], from: number, to: number) {
  const firstIndex = Math.min(from, to);
  const first = clips[firstIndex];
  const second = clips[firstIndex + 1];
  if (first.locked || second.locked) throw Error("Mở khóa hai clip trước khi đổi thứ tự.");
  const left = Math.min(first.start, second.start);
  const right = Math.max(clipEnd(first), clipEnd(second));
  return clips.map((clip, i) => i === firstIndex
    ? { ...second, start: left }
    : i === firstIndex + 1 ? { ...first, start: rounded(Math.max(left, right - clipSpan(first))) } : clip);
}

export function splitCaptions(timeline: VideoTimeline, clip: TimelineClip, time: number, nextId: () => string) {
  return timeline.captions.flatMap((caption) => {
    if (caption.source_id !== clip.source_id || caption.start < clip.start || caption.end > clipEnd(clip) || time <= caption.start || time >= caption.end) return [caption];
    if (caption.locked) throw Error("Mở khóa phụ đề đi qua điểm tách.");
    return [{ ...caption, end: time, manually_verified: false }, { ...caption, id: nextId(), start: time, manually_verified: false }];
  });
}

/** Use the request start as a conservative bound on signing time. */
export function previewDeadlines(requestedAt: number, now: number, wallTime: number, expiresIn: number, rightsUntil: number) {
  const rightsDeadline = now + (rightsUntil - wallTime);
  const cutoff = Math.min(rightsDeadline, requestedAt + expiresIn * 1000);
  if (!Number.isFinite(cutoff) || cutoff <= now) return null;
  const refresh = requestedAt + expiresIn * 800;
  return { cutoff, refresh: refresh < rightsDeadline ? refresh : null };
}
