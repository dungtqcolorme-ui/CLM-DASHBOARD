# Coloro loading, actual bootstrap performance and status legend hotfix

Baseline:bceb3a1. Branch:codex/loading-performance-chart-hotfix. User brief2026-11-04 authorizes implementation and preview only. No redesign or production release.

## Audit and measured decisions

- Actual flow:auth profile → dashboard/session → private shell → blocking iframe assets/parse → dashboard/state → normalize/render. Parent's old load-state storage/cache RPC is not the active bootstrap path; do not optimize that dead path.
- HTML incorrectly includes data-clm-ready=1 before clmBoot. Baseline confirms parent marks the iframe ready while Overview is absent. Remove static readiness and keep real clmBoot ready signal after data/render.
- Controlled Chrome production-build baseline:3015 synthetic records;80ms network latency,1MB/s throughput,2×CPU;API latency held fixed;3 cold/3 warm/1 login. Usable waits for both ready frame and actual Overview. Median cold1847ms,warm1762ms; full-login-page navigation2252ms. Observer-only early readiness is invalid and not used as the usability metric.
- Required state starts roughly409ms after the shell response at cold load. Start the same authenticated state request after session POST succeeds, in parallel with shell; reuse that attempt's promise through a same-origin bridge. No endpoint/security/validation removed; no persistent cache introduced. Abort and clear on logout, role/retry or unmount, never share users/roles.
- Motion179011 raw bytes is currently parser blocking in the iframe even on Overview. Load asynchronously only on the four routes that use it; preserve static render and reduced-motion behavior. Offline preview embeds it.
- Status legend count column is fixed24px and percent30px, gap6px. Use intrinsic count/percent columns and stable gap/right alignment; preserve formatting and all calculations/colors.
- Drive folder rechecked:official AI and PDF only, no .riv. Reuse exact local extracted front vector, CSS eye/body loops; no animation dependency for loading. Shared inline vector provenance tested.

## Implementation/verification ledger

- [x] Audit real entry/bootstrap/cache/ready and record cold/warm/login baseline before product edits.
- [x] Inspect official assets and record no Rive rig.
- [x] Prove chart overflow with actual text bounds and attempt-loader absence with a failing test.
- [x] Implement attempt-scoped prefetch with abort/error/dedup tests; keep auth gates/timeouts/retry intact.
- [x] Implement SSR-visible Coloro loading/checking/error and nonblocking ready celebration; no minimum duration.
- [x] Replace iframe loading visuals without changing data/error/retry handlers; remove static readiness.
- [x] Defer Motion off bootstrap path and adapt offline/functional motion guards.
- [x] Fix only status-row CSS; test30 combinations across5 sizes and125% equivalent viewport with4–6 digits,0/100%,long labels.
- [x] Same-condition after benchmark with actual DOM usable check; compare FCP/LCP/TBT/script/task/JS/critical requests and retain limitations.
- [x] Full regression/build/lint/typecheck, loading screenshots, original chart before/after, privacy/abort/retry scenarios and four-tab parity.
- [ ] Deliver separate-branch Vercel/local preview;main/production unchanged.

## Guardrails

No schema,API contract,Sheet mapping,KPI,task permission/workflow or approved tab redesign. No request omission for auth or freshness. Server auth/session/shell/state implementations remain unchanged. Metrics are controlled-lab measurements, not production latency claims. Readiness correction may lengthen visible loading while real usable time improves; never count hiding the loader as a speedup.

## Final evidence

- Final68tests/build/lint/typecheck pass.9 focused tests cover exact SVG, real readiness, attempt scope/dedup/error/body abort/deadline and text transport.
- Independent review found session/profile continuation and body lifetime cancellation gaps; generation/mount guards and full-body deadline fix them. Final source review has no important issues.
- Final browser stress: checking/loading not ready, nonblocking success, no loading animation after unmount, real HTTP error/retry, fresh state on frame reload, reduced-motion geometry and reversed session-role responses all pass.
- Final fixed-source benchmark median:cold1942→1640ms,warm1758→1441ms;login token-request→usable1601→1307ms (one sample). Iframe JS212675→34384raw bytes. Parent LCP/warm TBT tradeoffs reported without blanket speed claims.
- Source/API/auth/schema/Sheet mapping untouched; client profile cache unchanged. Required state request overlaps shell only after session success; no artificial delay or minimum loading duration.
- Chart30cases pass at5viewport sizes and125% equivalent viewport; min painted-text gap12px; original CSS fails. All default Overview DOM preserved; only intended legend pixels differ (outside legend0).
- Before loading visual generated from the exact baseline React component/CSS. After screenshots are actual local production-build views with synthetic auth/data. Native browser zoom and live Supabase/Sheet latency are explicitly not certified by the controlled harness.
