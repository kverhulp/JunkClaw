repo: kverhulp/JunkClaw
branch: main
## Last sync
date: 2026-08-14T20:50:55Z

### Updated in this project
- Read the full monorepo: extension (badge, popup, options), web dashboard skeleton, API contracts, and DESIGN.md.
- Product is pre-build (README: "design is settled; the scaffold is next") — the current UI is intentionally plain/unstyled scaffolding, not a finished design to clone.
- Next: apply DESIGN.md's slate design system to the real screens (badge/detail panel, popup, options/saved criteria, web dashboard), grounded in the actual data contracts (Analysis, CompSet, RiskFlag) and copy rules from docs/handoff/web-dashboard.md.

## Screen map
| Project screen | Repo source |
| --- | --- |
| (not yet built) Inline deal badge | apps/extension/lib/overlay.ts, lib/cards.ts |
| (not yet built) Marketplace detail panel | apps/extension/entrypoints/overlay.content.ts, lib/parse.ts |
| (not yet built) Extension popup | apps/extension/entrypoints/popup/* |
| (not yet built) Options — saved criteria & connection | apps/extension/entrypoints/options/* |
| (not yet built) Web dashboard home / connect-extension | apps/web/app/page.tsx, layout.tsx, globals.css, docs/handoff/web-dashboard.md |
