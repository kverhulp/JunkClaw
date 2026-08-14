# AGENTS.md — JunkClaw

Guidance for AI agents (Claude, Codex, etc.) working in this repo. Read this
before starting a task.

## What this is

A Chrome MV3 browser extension (TypeScript) that enriches Facebook Marketplace
vehicle listings with comparable-price scoring and drafted seller messages,
backed by a Next.js app on Vercel that hosts the API and the Mastra agents.

Read [`docs/JunkClaw-Build-Plan.md`](docs/JunkClaw-Build-Plan.md) for product
decisions and
[`docs/superpowers/specs/2026-08-14-junkclaw-architecture-design.md`](docs/superpowers/specs/2026-08-14-junkclaw-architecture-design.md)
for technical ones. Both are authoritative; this file is the short version.

## Build, run, test

`pnpm` is **not installed globally** on this machine — every command below runs it
through `npx --yes pnpm@10`. Install it properly if you get tired of the prefix.

- **Install:** `npx --yes pnpm@10 install`
- **Everything green (what CI runs):** `npx --yes pnpm@10 verify`
  Baseline: **5 guards, 0 lint errors, 6 packages typechecking, 190 tests.** Report
  the counts after your change.
- **Guards only** (fast, run before pushing): `npx --yes pnpm@10 guards`
- **Extension:** `cd apps/extension && npx --yes pnpm@10 build` → loads from
  `.output/chrome-mv3` via `chrome://extensions` → Load unpacked. Dev: `pnpm dev:ext`.
- **Web:** `cd apps/web && npx --yes pnpm@10 build`, or `pnpm dev:web` (:3000).
- **DB:** `pnpm db:generate` then `pnpm db:migrate` (needs `DATABASE_URL`).
- **Extension token** (M0, until the connect-extension page exists):
  `pnpm token:issue you@example.com` → paste into the extension's options page.

### Version traps that already bit once

- **TypeScript is pinned to `^6.0.3`, not 7.** TS 7.0.2 installs and typechecks
  fine, but `typescript-eslint` hard-refuses it (`supported: >=4.8.4 <6.1.0`), so
  `pnpm lint` dies before linting anything. Don't "upgrade" it until
  typescript-eslint ships TS 7 support.
- **Relative imports inside packages carry no `.js` extension.** The packages
  ship TypeScript source (`exports` → `src/index.ts`) and Turbopack will not map
  `./foo.js` → `./foo.ts`; Next fails the build with "The module has no exports
  at all". `moduleResolution: "bundler"` makes extensionless correct.
- **`.npmrc` sets `node-linker=hoisted`** because WXT can't resolve its Vite
  plugin chain under pnpm's default symlinked layout.
- **`@types/node` needs an explicit `"types": ["node"]`** in `packages/db` and
  `packages/agents` — TS 6 doesn't pick it up by typeRoots walk-up here.

### Testing the database

`packages/db` tests run **real Postgres in-process** via PGlite — no Docker, no
`DATABASE_URL`, no service. `createTestDatabase()` applies the same
`migrations/` directory that ships to production, so a migration that won't
apply fails in CI before it reaches a real database. Write persistence tests
there rather than mocking Drizzle; a mock's idea of `ON CONFLICT` is not
evidence. They run ~6s, which is why the suite is slower than it was.

## Architecture

```
apps/extension    WXT · MV3 · content script, background worker, options, popup
apps/web          Next.js — dashboard, /api/{ingest,score,criteria,negotiate}, Mastra host
packages/schema   Zod contracts, the extension↔server boundary
packages/core     deterministic valuation: normalize, dedup, comps, scoring
packages/agents   Mastra agents, workflows, tools, memory
packages/db       Drizzle schema + migrations (Neon Postgres)
```

CI runs the same gate on every push and PR, plus both builds — see
[`docs/ci-cd.md`](docs/ci-cd.md) for the pipeline, the guards, and what is
deliberately not automated.

**Sequencing lives in [`docs/roadmap.md`](docs/roadmap.md)** — ordered goals for
M0/M1/M2 with a "done when" for each. Check there before picking up work; the
order encodes dependencies that aren't obvious from the code.

## Division of labour

- **Ours: the extension (`apps/extension/`) and everything behind it** — the API
  routes in `apps/web/app/api/`, plus `packages/{schema,core,db,agents}`.
- **The dashboard UI in `apps/web` belongs to a coworker.** Don't build
  `page.tsx`, layouts, styling, sign-in screens, or dashboard views there. For
  anything they need, write it up in [`docs/handoff/`](docs/handoff/) — API
  contract plus concrete UI items marked exists/planned — rather than
  implementing it.
- The extension's *own* UI (inline badge, detail panel, popup, options form) is
  ours: it renders from a content script inside Facebook's page, and is not part
  of that handoff.

## Hard rules

- **Dependency direction is `agents → core → schema`. Never backwards.**
  `packages/core` must not import Mastra, Next, or anything from the extension.
  The valuation math stays testable without a model and portable off Mastra.
- **Most of this is not agentic.** Dedup, comps, price delta, days on market,
  mileage adjustment, filtering, and scoring are deterministic TypeScript in
  `packages/core`. An agent that returns a different valuation each run is a bug,
  not a feature. Agents go where the input is language or judgment.
- **The price ceiling is enforced in `core`, after the draft exists and before
  the composer fill — never as an instruction in a prompt.** A model that talks
  itself past a spending limit is the one failure we cannot ship.
- **Never send seller PII off-device.** No seller names, profile links, seller
  ids, or message contents reach the server. The ingest DTO in `packages/schema`
  omits them by construction; keep it that way. This is PIPEDA, not preference.
  **Vehicle photo URLs are allowed** (decision 2026-08-14) — the dashboard
  displays them. A photo of a car is not personal information; the seller is.
- **Never select on Facebook's CSS classes.** Parse the GraphQL/JSON payloads.
  Keep the DOM fallback, and keep the parse-failure alarm working.
- **The overlay renders in a shadow DOM.** Facebook's stylesheet must not reach
  our UI, and ours must not reach theirs.
- **No background polling of Marketplace.** v1 enriches pages the user is already
  looking at. Automation is what gets the user's personal Facebook account banned.
  Any future polling ships opt-in with explicit consent, never on by default.
- **Say "not enough data" rather than guess.** PEI is a thin market. A confident
  wrong number loses trust permanently. The UI says "vs. similar asking prices",
  never "market value" — we have asking prices, not sale prices.

## Conventions

- **Commits:** Conventional Commits — lowercase `type: subject` (`feat:`, `fix:`,
  `docs:`, `chore:`, `refactor:`, `test:`). One logical change per commit;
  generated artifacts go in the *same* commit as the change that produced them.
- **NEVER** add Claude/Anthropic attribution — no `Co-Authored-By`, no "Generated
  with", no mention — in commits, PR bodies, or comments.
- **Never `git push` without explicit approval.** Commit freely; push only when
  asked, per-push.
- **Zod at every boundary.** Extension↔server, workflow step inputs and outputs,
  and every structured-output call.
- **Don't hardcode a model provider.** Mastra routes across providers; the choice
  gets made on evals against our own listings, not on vibes.

## Milestone gate

**M0 is the gate.** Corpus in, dumb median-of-comps number on screen, no AI.
It answers whether credible valuations are possible in a market this thin.
Agents and negotiation flows are worth nothing if the comp data can't support a
number — do not build ahead of that answer without saying so out loud.
