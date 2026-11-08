"use client";

import { useEffect, useRef, useState } from "react";
import type { CalendarThumbnailQueue } from "@/lib/marketing/calendar-thumbnail-queue";
import { CreativeCancelled } from "../creative/request-state";
import { MarketingError } from "@/lib/marketing/domain";
import type { CalendarMediaAccess } from "./media-preview";

export function CalendarThumbnail({ jobId, assetId, access: { request, capture }, queue }: {
  jobId: string; assetId: string; access: CalendarMediaAccess; queue: CalendarThumbnailQueue;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("Chờ tải ảnh");
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const assertCurrent = capture();
    let cancelled = false, objectUrl = "", deadline = 0;
    let expiry: ReturnType<typeof setTimeout> | undefined, timeout: ReturnType<typeof setTimeout> | undefined;
    const expire = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = "";
      setUrl("");
      setNotice("Ảnh hết hạn");
    };
    const checkDeadline = () => { if (deadline && Date.now() >= deadline) expire(); };
    const onPageHide = () => { if (objectUrl) expire(); };
    document.addEventListener("visibilitychange", checkDeadline);
    window.addEventListener("pagehide", onPageHide);
    void queue.run(controller.signal, async () => {
      assertCurrent();
      if (cancelled) return;
      timeout = setTimeout(() => controller.abort(), 10000);
      const response = await request(`/api/marketing/calendar/media?job_id=${jobId}&asset_id=${assetId}&variant=thumbnail`, { signal: controller.signal });
      deadline = Math.min(Date.parse(response.headers.get("X-Marketing-Preview-Until") ?? ""), Date.now() + 30000);
      const blob = await response.blob();
      assertCurrent();
      if (cancelled || controller.signal.aborted) return;
      if (!Number.isFinite(deadline) || deadline <= Date.now()) { expire(); return; }
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
      setNotice("");
      expiry = setTimeout(expire, deadline - Date.now());
    }).catch((error) => {
      if (!cancelled && !(error instanceof CreativeCancelled)) {
        setNotice(error instanceof MarketingError && error.status === 429 ? "Đã đạt giới hạn tải" : "Ảnh không khả dụng");
      }
    }).finally(() => { if (timeout) clearTimeout(timeout); });
    return () => {
      cancelled = true;
      controller.abort();
      if (expiry) clearTimeout(expiry);
      if (timeout) clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      document.removeEventListener("visibilitychange", checkDeadline);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [assetId, capture, jobId, queue, request, visible]);
  return <span ref={element} className="mk-calendar-thumbnail">
    {/* User-scoped, expiring object URL; public image optimization must not cache private media. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url && <img src={url} alt="Ảnh đầu tiên trong bản duyệt" onError={() => { URL.revokeObjectURL(url); setUrl(""); setNotice("Ảnh không khả dụng"); }} />}
    {notice && <small>{notice}</small>}
  </span>;
}
