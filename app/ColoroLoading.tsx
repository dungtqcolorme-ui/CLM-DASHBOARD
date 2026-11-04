import { COLORO_SVG } from "@/lib/coloroSvg";

export type ColoroState = "checking" | "loading" | "success" | "error";

export function ColoroLoading({ state = "loading" }: { state?: ColoroState }) {
  return (
    <div className="coloro-loader" data-coloro-visual data-state={state} aria-hidden="true">
      <span className="coloro-shadow" />
      <span className="coloro-mark" dangerouslySetInnerHTML={{ __html: COLORO_SVG }} />
      <span className="coloro-progress"><i /></span>
    </div>
  );
}
