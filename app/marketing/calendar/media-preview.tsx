"use client";

import { useEffect, useState } from "react";
import { CreativeCancelled } from "../creative/request-state";

export type CalendarMediaAccess = {
  request: (url?: string, init?: RequestInit) => Promise<Response>;
  capture: () => () => void;
};

export function CalendarMediaPreview({ jobId, assets, access }: {
  jobId: string; assets: { id: string; version: number }[]; access: CalendarMediaAccess;
}) {
  const [index, setIndex] = useState(0);
  const asset = assets[index];
  if (!asset) return null;
  return <section className="mk-calendar-preview" aria-label="Ảnh đã duyệt">
    <div className="mk-actions">
      <strong>Ảnh {index + 1} / {assets.length} · v{asset.version}</strong>
      {assets.length > 1 && <>
        <button disabled={index === 0} onClick={() => setIndex(index - 1)}>Ảnh trước</button>
        <button disabled={index === assets.length - 1} onClick={() => setIndex(index + 1)}>Ảnh sau</button>
      </>}
    </div>
    <CalendarImage key={`${jobId}:${asset.id}:${asset.version}`} jobId={jobId} assetId={asset.id}
      label={`Ảnh trong bản duyệt · ${index + 1} / ${assets.length}`} access={access} />
    <p className="mk-muted">Ảnh từ đúng bản duyệt. Tự ẩn sau tối đa 30 giây; mỗi lần tải lại sẽ kiểm tra quyền sử dụng.</p>
  </section>;
}

function CalendarImage({ jobId, assetId, label, access: { request, capture } }: {
  jobId: string; assetId: string; label: string; access: CalendarMediaAccess;
}) {
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!attempt) return;
    const assertCurrent = capture();
    const controller = new AbortController();
    let cancelled = false, objectUrl = "";
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      try {
        const response = await request(`/api/marketing/calendar/media?job_id=${jobId}&asset_id=${assetId}`, { signal: controller.signal });
        const deadline = Math.min(Date.parse(response.headers.get("X-Marketing-Preview-Until") ?? ""), Date.now() + 30000);
        const blob = await response.blob();
        assertCurrent();
        if (cancelled) return;
        if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error("Ảnh xem trước đã hết hạn. Tải lại để kiểm tra quyền hiện tại.");
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        timer = setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          setUrl("");
          setNotice("Ảnh xem trước đã hết hạn. Tải lại để kiểm tra quyền hiện tại.");
        }, deadline - Date.now());
      } catch (error) {
        if (!cancelled && !(error instanceof CreativeCancelled)) setNotice(error instanceof Error ? error.message : "Chưa tải được ảnh xem trước.");
      } finally { if (!cancelled) setPending(false); }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, attempt, capture, jobId, request]);
  return <>
    <button disabled={pending} onClick={() => { setUrl(""); setNotice(""); setPending(true); setAttempt(attempt + 1); }}>
      {pending ? "Đang kiểm tra và tải ảnh…" : attempt ? "Tải lại ảnh xem trước" : "Xem ảnh trong bản duyệt"}
    </button>
    {notice && <p role="status" className="mk-notice">{notice}</p>}
    {/* Private object URLs are scoped to this mounted preview and cannot use the public image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url && <img src={url} alt={label} onError={() => { URL.revokeObjectURL(url); setUrl(""); setNotice("Không thể hiển thị file ảnh trong bản duyệt."); }} />}
  </>;
}
