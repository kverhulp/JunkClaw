# JunkClaw — Repo & Agent Architecture

*Date: 2026-08-14. Status: approved for scaffold. Companion to
[`docs/JunkClaw-Build-Plan.md`](../../JunkClaw-Build-Plan.md), which owns the
product decisions. This document owns the technical ones.*

---

## Scope

The build plan settles *what* JunkClaw is and *why* it is an extension. It leaves
the code shape open. This design fixes the repo layout, the runtime topology, the
data path from scroll to badge, and the exact roster of agents — enough that
implementation is filling in bodies rather than inventing structure.

---

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Mastra runtime | Embedded in the Next.js app; agents quarantined in `packages/agents` | One deploy, one env, no service-to-service auth. The package imports nothing from Next, so lifting it into a standalone Mastra server later is a deploy change, not a rewrite |
| Scoring path | At scroll time — badges on the grid, cache-first | The product's pitch is grid-level triage ("which three of two hundred"). A detail-panel-only product doesn't deliver it |
| Accounts | Multi-user from day one | Auth is cheaper to build before there is data to migrate than after |
| Auth | better-auth (magic link + Google); extension holds a bearer token | No Facebook OAuth anywhere — it buys nothing and requires Meta app review we won't pass |
| Extension framework | WXT (MV3, TypeScript, HMR) | Removes hand-rolled manifest and build plumbing |
| Database | Postgres on Neon, Drizzle ORM | SQL-first, migrations in the repo, cheap branch databases for testing. Mastra memory and workflow state share it |
| Package manager | pnpm workspaces | Workspace protocol keeps the dependency rule below enforceable |

---

## Repo layout

```
JunkClaw/
├── apps/
│   ├── extension/          WXT, MV3, TypeScript
│   │   └── src/
│   │       ├── content/
│   │       │   ├── inject.ts      page-context fetch/XHR patch
│   │       │   ├── bridge.ts      postMessage: page world ↔ isolated world
│   │       │   ├── overlay/       inline deal badge + detail panel (shadow DOM)
│   │       │   └── composer.ts    fills the Messenger composer
│   │       ├── background/        service worker: queue, batch, retry, auth
│   │       ├── options/           saved criteria
│   │       ├── popup/             on/off, ingest counts, parse health
│   │       └── lib/               api client, storage, telemetry
│   └── web/                Next.js — dashboard + API + Mastra host
│       └── app/api/{ingest,score,criteria,negotiate}/
├── packages/
│   ├── schema/             Zod contracts. The ext↔server boundary
│   ├── core/               deterministic: normalize, dedup, comps, scoring
│   ├── agents/             Mastra: agents, workflows, tools, memory
│   └── db/                 Drizzle schema + migrations
└── docs/
```

### The dependency rule

```
agents ──▶ core ──▶ schema
```

Never backwards. `core` contains no Mastra import anywhere, which makes the
valuation math testable without a model and portable if Mastra disappoints. This
is lint-enforced, not a convention we remember.

---

## The data path

```
you scroll Marketplace
   │
   ├─ inject.ts patches fetch/XHR in page context, reads the GraphQL payload
   ├─ bridge.ts postMessages it to the isolated world
   ├─ background worker batches, deduplicates by URL hash, strips PII
   │
   ├─ POST /api/ingest ──▶ ingest-listing workflow
   │                       normalize → [listing-extractor] → [dedup-adjudicator] → persist
   │                       (first_seen, last_seen, price_history, raw_payload)
   │
   └─ POST /api/score  ──▶ cached listings: badge renders immediately
                           unknown listings: "…", refetch at 2s
                           score-listing workflow
                           [comp-curator] selects the comp set
                           core computes delta, deal, fit   ← no model touches the number
                           [risk-analyst] flags the description
```

Two rules the implementation must not drift from:

- **Never select on Facebook's CSS classes.** Payloads only, with a DOM fallback
  and an alarm on parse-failure rate.
- **The overlay renders in a shadow DOM** so Facebook's stylesheet cannot reach
  our UI and ours cannot reach theirs.

---

## Agents

Agents where the input is language or judgment; deterministic code where the
output is a number. The build plan's rule — *"most of this is not agentic"* —
holds.

| Agent | Job | Tools | Milestone |
| --- | --- | --- | --- |
| `listing-extractor` | Title + description → structured vehicle fields (make, model, year, trim, mileage, VIN, transmission, drivetrain). Regex/heuristic fast path first; model only on miss | — (structured output) | M0 |
| `dedup-adjudicator` | The ambiguous tail only. Deterministic blocking handles the easy majority; this decides "same car relisted vs. two similar cars" | `getListingHistory`, `searchCorpus` | M0 |
| `comp-curator` | The thin-market problem. Decides *how* to widen — radius, year band, trim equivalence, cross-model substitutes — or returns "not enough data". Picks the comp set; never computes the number | `searchCorpus`, `getComps` | M1 |
| `risk-analyst` | Reads the description for salvage/rebuilt language, rust, "needs work", odometer inconsistency, dealer-posing-as-private. Emits typed flags with the quote as evidence, plus confidence | `getListingFacts` | M1 |
| `criteria-interpreter` | Options page: free text → structured `SavedCriteria`. The form still works standalone; this is the fast path | — (structured output) | M1 |
| `negotiation-copilot` | Drafts the opener and follow-ups, asks for the VIN first, runs as a suspended workflow awaiting approval | `getComps`, `getListingHistory`, `getUserLimits`, `getListingFacts` | M2 |
| `parse-sentinel` | Ops, off the hot path. On a parse-failure alarm, diffs stored `raw_payload` against the expected schema and proposes the field-mapping patch | `getRawPayloads` | M1 |
| `eval-judge` | Offline. Grades extraction, risk, and draft quality against labeled examples so model providers can be compared on real listings | — | M1+ |

### Not agents

Deterministic TypeScript in `packages/core`: normalize, dedup blocking and
similarity, comp selection math, price delta, days on market, price-drop history,
mileage adjustment, Deal score, Fit score — and the price ceiling.

### Workflows

Mastra `createWorkflow` / `createStep` from `@mastra/core/workflows`, plain
TypeScript inside each step, Zod at every boundary.

- `ingest-listing` — normalize → extract → dedup → persist → snapshot
- `score-listing` — comps → delta → deal + fit → flags
- `negotiate` — draft → **suspend** → user edits/approves → ceiling check →
  composer fill

Negotiation uses `stateSchema` and `resumeStream()`. The run suspends in Postgres
waiting for the user, so a serverless function timeout cannot kill a negotiation.

**The price ceiling is checked in `core` after the draft exists and before the
composer fill.** Never in a prompt. This is the one failure mode that must be
structurally impossible rather than discouraged.

---

## The PII boundary

`packages/schema` defines the ingest DTO with no seller name, no profile URL, no
photos, and no message text. This is a type, not a policy — code that tries to
send those fields does not compile.

Message drafting sends listing facts and the user's own limits. Nothing about the
seller as a person crosses the network, per PIPEDA and per the build plan.

---

## What the scaffold contains

A runnable skeleton with nothing faked as working:

- Extension loads in Chrome and injects a placeholder badge on Marketplace
- Web app boots with the four API routes stubbed
- Drizzle schema carrying the full `Listing` model from the build plan, including
  `first_seen`, `last_seen`, `price_history`, `is_dealer`, `vin`, `raw_payload`
- All eight agents stubbed with real Zod signatures and TODO bodies
- Lint rule enforcing the dependency direction
- Vitest wired in each package

## Open decisions inherited from the build plan

These stay open; none of them block the scaffold.

1. Is background polling ever on the table?
2. Do we run a server-side Kijiji/AutoTrader collector to seed comps?
3. Product name — "JunkClaw" is the working directory, not a decision.
