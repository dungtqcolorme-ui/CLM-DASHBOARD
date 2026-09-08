import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOCUMENT_CATALOG } from "../lib/documents.ts";

const sourcePath = new URL("../dashboard/clm-dashboard-private-34.html", import.meta.url);
const html = await readFile(sourcePath, "utf8");
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

assert.ok(script, "Dashboard inline script is missing");
assert.doesNotThrow(() => new Function(script), "Dashboard inline script has a syntax error");
assert.ok(html.startsWith("<!doctype html>"), "Dashboard must start with a doctype");
assert.ok(html.endsWith("</html>\n"), "Dashboard must be a complete HTML document");
assert.equal((html.match(/id="modal-root"/g) ?? []).length, 1, "Dashboard must include one modal host");
assert.equal((html.match(/id="toast-wrap"/g) ?? []).length, 1, "Dashboard must include one toast host");
assert.ok(
  html.includes("if(!host){host=document.createElement('div');host.id='modal-root'"),
  "Modal creation must recover when its host is missing",
);
assert.equal(
  /window\.__CLM_BOOTSTRAP_PROFILE__\s*=/.test(html),
  false,
  "Tracked release must not include a signed-in profile payload",
);
assert.equal(
  /custom-cursor|data-codex-favicon-badge|ogdlpmhglpejoiomcodnpjnfgcpmgale/i.test(html),
  false,
  "Tracked release must not include browser-extension artifacts",
);

const requiredDocumentNames = DOCUMENT_CATALOG.flatMap((group) => [...group.names]);
assert.equal(requiredDocumentNames.length, 27, "Document catalog must contain all 27 required entries");
for (const documentName of requiredDocumentNames) {
  assert.ok(html.includes(documentName), `Missing document catalog entry: ${documentName}`);
}

assert.ok(html.includes("loading=\"lazy\""), "Avatar lazy loading is missing");
assert.ok(html.includes("CLM_PROFILE_CACHE_TTL"), "Profile cache is missing");
assert.ok(html.includes("Chưa phân loại"), "Document fallback group is missing");
assert.ok(html.includes("noopener,noreferrer"), "External document links must be isolated");
assert.ok(
  html.includes("Liên kết tài liệu không an toàn."),
  "Legacy document links must be protocol-validated at interaction time",
);
assert.equal(
  html.includes(".doc-v34-actions .icon-btn:not(:first-child){display:none}"),
  false,
  "Mobile document management controls must remain available",
);
assert.ok(
  html.includes("finally(()=>{clmDocumentsRemote.loading=false;render();})"),
  "Document synchronization must render after clearing its loading state",
);
assert.ok(html.includes("duplicate-work-item"), "Duplicate Task RPC is missing from the dashboard");
assert.ok(html.includes('id="uw-shift"'), "Daily Task shift selector is missing");
assert.ok(html.includes("Chưa phân ca"), "Legacy tasks need an explicit unassigned-shift label");
assert.ok(html.includes("Task daily của Trainee"), "Mentor read-only tracking panel is missing");
assert.ok(html.includes("load-mentor-daily-tasks"), "Mentor task scope must be loaded through the server API");
assert.ok(
  html.includes("if(!clmMentorState.attempted&&!clmMentorState.loading)"),
  "Mentor loading failures must not trigger a render retry loop",
);
assert.ok(html.includes("Chưa truy cập"), "Account activity needs a never-seen fallback");
assert.equal(
  html.includes("email==='dungtq.colorme@gmail.com'?'Qu. Dũng'"),
  false,
  "Task ownership must not be renamed with an email-specific hard-code",
);

console.log("Dashboard release checks passed");
