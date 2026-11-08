# Integration inventory — 2026-11-04

Evidence is from this checkout, installed package manifests, the tool registry exposed to this chat and read-only inspection of Supabase. Availability in Codex does not grant the deployed application any tool permission. No package was added to the application.

| Component | Verified local version/state | License / permission | Decision |
|---|---|---|---|
| Next.js | 16.2.10 | MIT | Reuse App Router, route handlers, persistent root layout |
| React / React DOM | Initially installed 19.2.6; `pnpm verify` synchronized to lockfile 19.2.4 | MIT | Reuse; retain lockfile/dependencies |
| TypeScript | 5.9.3 | Apache-2.0 | Reuse strict typechecking |
| Tailwind | Installed 4.3.3 | MIT | Retain; scoped CSS avoids legacy leakage |
| Supabase JS | 2.110.7 | MIT | Reuse user-JWT client from `dashboardSession.ts`; no Marketing service-role access |
| Supabase MCP | Available; CLM project `bluyofnhkbexlbicdtds`, PostgreSQL 17.6 | Connected developer tool; not a deployed agent tool | Read-only project/table inspection; no production migration applied |
| Legacy auth | Active/pending/locked profiles, roles array, JWT validation | Existing authentication | Reuse; selected role/header is not authorization |
| Mentor mapping | `mentor_trainees`, currently zero rows | Existing unrelated team scope | Skip; add explicit Marketing membership |
| Private dashboard | Tracked release 34, current branch based on loading hotfix | Existing application | Add disclosure only; root host retains mounted iframe during client navigation |
| Brand assets | Existing `/colorme-logo.png`; existing `--red`, `--ink`, neutral shell | Original asset retained without regeneration | Reuse ratio, light theme; no new official Brand DNA claimed |
| Node | 24.22.1 | Node runtime | Reuse |
| FFmpeg | 9.0.1 command available | Build/license options require audit before distribution/use | Defer video worker; executable presence is not render capability |
| Playwright / Chrome | Existing bundled runtime; external QA dependency | Apache-2.0 / installed browser | Reuse for local intercepted QA; not bundled with app |
| PGlite | 0.3.14, installed only under `/private/tmp/clm-marketing-db-runtime` | Apache-2.0 (installed package manifest) | Disposable PostgreSQL engine for SQL/RLS tests; not a production dependency |
| Supabase CLI / psql | Not on PATH at audit | — | SQL file generated with documented timestamp fallback; use PGlite locally |
| Codex `marketing_core` | Tools present; context/health both returned `CONTEXT_MISSING` | Project-scoped adapter; no account certified | Skip integration until project context is configured; never claim a verified Meta account |
| Codex Google Drive / GitHub / Vercel connectors | Available in tool registry | Developer account scopes, not application OAuth | Discovery only; no deployed connection implied |
| Skills | Installed host skills: superpowers, Supabase, ui-ux-pro-max, React best practices; local marketing/social and creative skills also present | Local instruction assets, no runtime capability | Reuse planning/implementation/review guidance; marketing content skills deferred |

Local `.agents/skills`, `.codex`, `.mcp.json` do not exist in this repository. User-level Codex configuration has node_repl, computer-use and marketing_core server entries; only server names were inspected. No secret values were copied. Existing workspace folders include Canva rebuild, internet assets, transcription/whisper and outputs; these were not imported as approved ColorME assets.

## Candidate disposition

The following are references from the supplied specification, **not verified installed integrations**. No license, API compatibility or production-readiness claim is made for an unadopted candidate.

| Candidates | Decision and reason |
|---|---|
| oliverames/meta-mcp-server, mikusnuz/meta-mcp, thenavidm/facebook-mcp-cli, HasData/facebook-mcp, thenavidm/instagram-mcp, posteverywhere/mcp | Defer. No exposed Meta/social tool is available in this chat. No deployment dependency exists. The archive date/API version reported in the attachment has not been independently certified; do not adopt or pin Graph API from it. Audit current source/license/API before Phase 4. |
| Seym0n/tiktok-mcp, Infatoshi/x-mcp | Skip V1; no continuous monitoring or additional publishing channels. |
| Remotion, HyperFrames, browser-use/video-use, ellmos-ai/ai-media-editor | Defer Phase 5. Not installed in this application's package manifest. Remotion commercial terms, actual render cost, worker isolation and STT sources require separate verification; no ElevenLabs dependency added. |
| suprisedr/poster-design-mcp, Fabric.js, Konva | Not adopted. Phase 3 core uses native browser Canvas with versioned editable scene JSON; PNG is an export, not the source of truth. No canvas application dependency added. |
| coreyhaines31/marketingskills, OpenClaudia/openclaudia-skills, cgallic/kai-cmo-harness, zubair-trabzada/ai-marketing-claude, linearclock/marketing-skills, nowork-studio/notfair-plugin | No blind installation. Existing host marketing skills are sufficient for later evaluation, but no application agent or external provider is configured in Phase 1. |
| amekala/ads-mcp, googleads/google-ads-mcp, mikusnuz/meta-ads-mcp | Excluded; no advertising mutation or paid/organic mixing. |
| InvokeAI, Qwen-Image, ComfyUI, comfyui-ipadapter, other image/video/voice generation | Excluded from app architecture and command allowlist. A developer image-generation tool being present does not make it reachable by the app. No generated media call was made. |

## External identities

Meta remains **Not Connected**. `103245086061688` is only the user-provided Business Suite asset hint; it was not used as a verified Page ID. No Page name/ID, tasks, scopes, insight permission, token, scheduler or cancellation capability has been verified.

Google Calendar/Gmail OAuth does not authorize Drive. Drive, agent execution and video rendering remain unconfigured. Phase 1 stores no OAuth credentials, media, private source documents or personal comments.

Phase 3 adds user-JWT private Supabase Storage uploads and native browser raster rendering only. The private bucket/policies are defined in a local additive migration; no real bucket was created in this session. Storage HTTP is simulated in the browser fixture, with actual PostgreSQL metadata/RLS executed locally. No Codex Drive connector was repurposed as the deployed application's OAuth connection. System font choices are editor defaults, not a claim about official ColorME typography.

## Documentation checked

Current [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database functions documentation](https://supabase.com/docs/guides/database/functions) were consulted for policies, privileges and function security. The markdown changelog fetch was unavailable in the browser tool/restricted network; no compatibility claim relies on it. All adopted calls use the existing installed SDK and were exercised by API/SQL tests.

Phase 3 additionally consulted current [private bucket documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) through Supabase documentation search. Storage operations use existing SDK methods; deployed HTTP/policy integration remains unverified until staging acceptance.

## Phase 5 additions

| Component | Installed version and source | Decision |
|---|---|---|
| PDFKit | 0.20.2, MIT. [Upstream](https://github.com/foliojs/pdfkit) | Server-side PDF with embedded Vietnamese font and approved report snapshot. |
| ExcelJS | 4.4.0, MIT. [Upstream](https://github.com/exceljs/exceljs) | Server-side XLSX. User content is written as literal strings. |
| Sharp | 0.35.5, Apache-2.0 from installed package metadata. [API](https://sharp.pixelplumbing.com/api-constructor/) | Already installed transitively through Next; now a direct pinned dependency for private Calendar thumbnails. Fixed WebP resize, no enlargement/metadata retention, 3-second native timeout, one transform/process. Existing native binaries reused offline; production runtime validation remains in staging acceptance. |
| Noto Sans | Bundled TTF and SIL OFL 1.1. Hash and upstream URLs in `public/marketing/fonts/SOURCE.txt`. | PDF fallback for Vietnamese. Official dashboard logo stays at its source aspect ratio. |
| FFmpeg CLI | Existing 9.0.1 binary reports GPL-3.0-or-later build. | Generates a synthetic local test clip only. The app uses native browser media playback. Worker selection and production licensing remain pending. |
| Remotion, HyperFrames, STT | No app dependency or provider enabled. | Manual timeline and native preview. Worker status remains `not_configured`. |

## Phase 6 dependency update

Next.js and eslint-config-next use 16.4.5, React and React DOM use 19.3.1. Updated transitive pins are recorded in `pnpm-workspace.yaml`. The installed frozen lockfile matches the one audited with zero advisories on 06/11/2026. See `PHASE6_REPORT.md` for version sources and validation.
