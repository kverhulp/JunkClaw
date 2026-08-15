# JunkClaw

A browser extension that rides along while you shop for a used car on Facebook
Marketplace. It scores every listing against comparable asking prices, flags the
risks, and hands you the questions to ask the seller — what similar ones ask,
what is documented to fail on that generation, and what service the odometer
says is overdue.

Not another listings site. The value is **triage and preparation**: which three
of two hundred listings are worth your time, and what to ask when you get there.

It writes no messages, sends none, and never names a price to offer.

*The product is AutoScout. "JunkClaw" is the repo, not the name.*

## Current phase

Pre-build. The design is settled; the scaffold is next.

- **Product plan:** [`docs/JunkClaw-Build-Plan.md`](docs/JunkClaw-Build-Plan.md)
- **Architecture:** [`docs/superpowers/specs/2026-08-14-junkclaw-architecture-design.md`](docs/superpowers/specs/2026-08-14-junkclaw-architecture-design.md)
- **Agent guidance:** [`AGENTS.md`](AGENTS.md)

## Shape

```
apps/extension    WXT · Chrome MV3 · TypeScript
apps/web          Next.js on Vercel — dashboard, API, Mastra host
packages/schema   Zod contracts, the extension↔server boundary
packages/core     deterministic valuation: normalize, dedup, comps, scoring
packages/agents   Mastra agents, workflows, tools, memory
packages/db       Drizzle schema + migrations (Neon Postgres)
```

## Milestones

- **M0 — Corpus.** Read path + schema. Listings flowing in with `first_seen`,
  `last_seen`, `price_history`, `is_dealer`, raw payload. No AI. A dumb
  median-of-comps number on screen. **This is the gate:** it tells us whether
  credible valuations are possible in a market as thin as PEI.
- **M1 — Overlay.** Deal + Fit scoring, risk flags, detail panel, saved criteria.
- **M2 — Copilot.** Negotiation agent, suspend/resume approval, composer fill,
  code-enforced limits.
- **M3 — Reach.** Kijiji/AutoTrader ingestion, price-history views, opt-in
  background alerts.
