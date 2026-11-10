"use client";

import { useEffect, useRef } from "react";
import { COLORO_SVG } from "@/lib/coloroSvg";

export type ColoroMotionState = "idle" | "thinking" | "loading" | "success" | "error" | "creative" | "celebration";
export type ColoroState = "checking" | "loading" | "success" | "error";

export function ColoroMotion({ state = "idle", compact = false, progress = false }: {
  state?: ColoroMotionState;
  compact?: boolean;
  progress?: boolean;
}) {
  const visual = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = visual.current;
    if (!node) return;
    const owner = node.ownerDocument;
    const Observer = owner.defaultView?.IntersectionObserver;
    let visible = !Observer;
    const sync = () => { node.dataset.coloroPaused = String(owner.hidden || !visible); };
    const observer = Observer ? new Observer(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    }) : null;
    sync();
    observer?.observe(node);
    owner.addEventListener("visibilitychange", sync);
    return () => {
      observer?.disconnect();
      owner.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div ref={visual} className="coloro-loader" data-coloro-visual data-state={state} data-compact={compact || undefined} aria-hidden="true">
      <span className="coloro-shadow" />
      <span className="coloro-mark" dangerouslySetInnerHTML={{ __html: COLORO_SVG }} />
      {progress && <span className="coloro-progress"><i /></span>}
    </div>
  );
}

export function ColoroLoading({ state = "loading" }: { state?: ColoroState }) {
  return <ColoroMotion state={state === "checking" ? "thinking" : state} progress={state === "checking" || state === "loading"} />;
}
