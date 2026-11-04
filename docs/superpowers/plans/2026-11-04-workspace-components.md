# Component redesign completion plan

Scope: continue the approved four-route visual redesign on `codex/four-workspaces-redesign`, baseline `50b3af1`. User explicitly requires component-level completion, with the original Dribbble reference and approved Overview as direction. Inline execution; preview only.

## Design decisions

Keep the existing presentation adapter and original renderer functions. Cards gain primary/secondary/supporting treatments with distinct surfaces, proportions, typography, decorative icons and restrained hover. Original values/context remain intact. Charts keep their original type, geometry, values and native title content; replace saturated legacy styling with coordinated warm/sage/charcoal series and matching legends, readable axes and gridlines, and styled tooltips using those original titles. Tables get a complete shared cell/header/status/pagination treatment and locally sticky headers when scrollable. Existing selection/focus states are styled without adding selection workflow.

Use a pinned, locally hosted official Motion browser runtime for route/component/filter/modal and chart-data feedback. Bound animations, cancel on rerender/route exit, honor reduced motion. No advanced transition requires GSAP; no prepared Rive mascot asset/runtime exists, so retain the official current mascot rather than inventing one. No business source changes or new chart type.

## Acceptance ledger

- [x] Capture the previous component baseline, inspect all original chart/data/tooltip markup.
- [x] Add a browser component-quality guard: geometry/title parity, legend/series consistency, readable restyled charts/tables, actual Motion animation lifecycle and reduced-motion behavior. Watch the missing component treatment fail before implementation.
- [x] Implement all card tiers and shared interactive surfaces across four routes.
- [x] Restyle every existing chart and legend; preserve original coordinate/dash/height geometry and title content; add no chart to the task route, which has none.
- [x] Restyle every table, badge, pagination and existing focused/selected state; contain sticky headers/overflow locally.
- [x] Integrate bounded Motion feedback, including changed chart values, unchanged-filter suppression, modal entry and route cleanup. Keep native handlers intact.
- [x] Run all functional parity tests, full app verify and preview tests; capture before/after four viewports and inspect component details in each route, including task list/month/modals and reduced motion.
- [x] Final source/visual review completed locally. Independent reviewer was attempted but unavailable due to service usage limit; no independent approval claimed.
- [ ] Deliver updated labeled offline preview, component matrix/screenshots and Vercel branch preview; leave main/production untouched.

## Review focus

- Color mapping must update series and legend together without changing status meanings or geometry.
- Motion must not leave chart transforms/opacity on final state, replay unchanged data, leak handlers across renders or animate in reduced-motion mode.
- Tooltip content must come from original title content, never recomputed data or untrusted HTML.
- Sticky tables must keep all columns/actions/pagination visible through local scrolling.
- Original Overview DOM/styles/pixels and original business functions must remain unchanged.

## Rulings

- The task renderer has no existing chart: mark chart treatment not applicable rather than add a new feature.
- Keep the original native SVG titles and all mark geometry. Only category-label wrapping and style change; normalized text remains identical.
- Use Motion browser global at the existing vanilla iframe boundary. Pinned local vendor is unmodified, licensed and excluded from source lint; no React migration or unrelated dependency.
- Map both original neutral gray codes to one token so the reward arc and legend agree.
- Group secondary metric nodes before supporting nodes to avoid sparse auto-placement; original labels/values remain intact.
- Task list has eight active columns; preserve all and use local scroll with readable people/title/action widths.
