"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CreativeAsset, CreativePage, CreativeScene } from "@/lib/marketing/creative-types";
import { drawPage } from "./render";

export function CarouselStrip({ scene, pageId, assets, teamId, campaignId, request, onSelect }: {
  scene: CreativeScene;
  pageId: string;
  assets?: CreativeAsset[];
  teamId: string;
  campaignId: string;
  request: (path: string, init: RequestInit) => Promise<Response>;
  onSelect: (index: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [imageEpoch, setImageEpoch] = useState(0);
  const images = useRef(new Map<string, ImageBitmap>());
  const referenced = new Set(scene.pages.flatMap(page => page.layers.flatMap(layer => layer.type === "image" ? [layer.asset_id] : [])));
  const sources = (assets ?? []).filter(asset =>
    referenced.has(asset.id) && asset.team_id === teamId && (!asset.campaign_id || asset.campaign_id === campaignId) &&
    asset.status === "ready" && asset.rights !== "revoked");
  // Use the authorized metadata to downsample in one decode and keep layout edits from reloading photos.
  const imageKey = JSON.stringify(sources.map(({ id, width, height, version }) => [id, width, height, version]));

  useEffect(() => {
    const node = strip.current;
    if (!node || seen) return;
    const Observer = node.ownerDocument.defaultView?.IntersectionObserver;
    if (!Observer) {
      const task = setTimeout(() => setSeen(true), 0);
      return () => clearTimeout(task);
    }
    const observer = new Observer(([entry]) => { if (entry.isIntersecting) setSeen(true); });
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    const abort = new AbortController();
    const cache = images.current;
    const entries = JSON.parse(imageKey) as [string, number, number, number][];
    const load = async () => {
      setImageEpoch(epoch => epoch + 1);
      // Keep only one original in flight; bitmaps for previews have a 144px maximum edge.
      for (const [id, width, height] of entries) {
        if (abort.signal.aborted) break;
        try {
          const response = await request(`/api/marketing/creative/file?id=${id}`, { signal: abort.signal });
          const blob = await response.blob();
          const factor = Math.min(1, 144 / Math.max(width, height, 1));
          const bitmap = await createImageBitmap(blob, {
            resizeWidth: Math.max(1, Math.round(width * factor)),
            resizeHeight: Math.max(1, Math.round(height * factor)),
            resizeQuality: "high",
          });
          if (abort.signal.aborted) { bitmap.close(); break; }
          cache.set(id, bitmap);
          setImageEpoch(epoch => epoch + 1);
        } catch {
          // Keep the placeholder for a missing or inaccessible photo.
        }
      }
    };
    const task = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(task);
      abort.abort();
      cache.forEach(bitmap => bitmap.close());
      cache.clear();
    };
  }, [imageKey, request, seen]);

  return <div ref={strip} className="cr-strip" role="group" aria-label="Các trang carousel">
    {scene.pages.map((page, index) => <button type="button" key={page.id} aria-pressed={page.id === pageId}
      onClick={() => onSelect(index)} aria-label={`Trang ${index + 1}`}>
      <PageThumbnail scene={scene} page={page} images={images} imageEpoch={imageEpoch} />
      <span>Trang {index + 1}</span>
    </button>)}
  </div>;
}

function PageThumbnail({ scene, page, images, imageEpoch }: {
  scene: CreativeScene;
  page: CreativePage;
  images: RefObject<Map<string, ImageBitmap>>;
  imageEpoch: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const width = 72;
  const height = Math.round(width * scene.height / scene.width);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(width / scene.width, 0, 0, height / scene.height, 0, 0);
    drawPage(ctx, scene, page, images.current, true);
  }, [height, imageEpoch, images, page, scene]);

  return <canvas ref={canvas} width={width} height={height} aria-hidden="true" />;
}
