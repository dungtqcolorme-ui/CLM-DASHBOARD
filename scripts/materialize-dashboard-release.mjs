import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [, , inputPath, outputPath] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/materialize-dashboard-release.mjs <captured-html> <output-html>");
}

const captured = await readFile(inputPath, "utf8");
const rootStart = captured.indexOf('<div id="root">');
const mainScriptStart = captured.indexOf("<script>", rootStart);
const mainScriptClose = captured.indexOf("</script>", mainScriptStart);
const mainScriptEnd = mainScriptClose < 0 ? -1 : mainScriptClose + "</script>".length;

if (rootStart < 0 || mainScriptStart < 0 || mainScriptEnd <= mainScriptStart) {
  throw new Error("Captured dashboard does not contain the expected root and main script.");
}

const loadingRoot = [
  '<div id="root">',
  '<div style="min-height:100vh;display:grid;place-items:center;font:14px Arial;color:#68707a">',
  '<div style="display:grid;justify-items:center;gap:14px">',
  '<span class="app-loading-spinner" style="margin:0"></span>',
  '<span>Đang tải dữ liệu…</span>',
  "</div>",
  "</div>",
  "</div>",
].join("");

const layerRoots = [
  '<div id="modal-root"></div>',
  '<div id="toast-wrap" role="status" aria-live="polite" aria-atomic="true"></div>',
].join("");

function sanitizeCapturedHead(head) {
  return head
    // Browser tools/extensions can mutate the live document before it is saved.
    // Never promote those local-only artifacts into the tracked release shell.
    .replace(
      /<style\b(?=[^>]*\bid=(['"])custom-cursor\1)[^>]*>[\s\S]*?<\/style>\s*/gi,
      "",
    )
    .replace(
      /<link\b(?=[^>]*\bdata-codex-favicon-badge(?:-created)?=)[^>]*>\s*/gi,
      "",
    );
}

const withoutRenderedState = [
  sanitizeCapturedHead(captured.slice(0, rootStart)),
  loadingRoot,
  layerRoots,
  "\n",
  captured.slice(mainScriptStart, mainScriptEnd),
  "\n</body>\n</html>",
].join("");
const withoutInjectedProfile = withoutRenderedState.replace(
  /<script>\s*window\.__CLM_BOOTSTRAP_PROFILE__\s*=\s*.*?<\/script>/s,
  "",
);
const normalized = `${withoutInjectedProfile
  .replace(/^(?:<!doctype html>\s*)+/i, "<!doctype html>\n")
  .trimEnd()}\n`;

if (!normalized.includes("const SHEET_API=") || !normalized.endsWith("</html>\n")) {
  throw new Error("Materialized dashboard failed its integrity checks.");
}

await writeFile(outputPath, normalized, "utf8");

const checksum = createHash("sha256").update(normalized).digest("hex");
console.log(JSON.stringify({ outputPath, bytes: Buffer.byteLength(normalized), sha256: checksum }));
