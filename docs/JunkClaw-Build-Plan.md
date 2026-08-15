# JunkClaw — Product & Build Plan

*Product name: AutoScout. JunkClaw is the repo. Owner: Kody. Last updated: 2026-08-15.*

---

## What we're building

A browser extension that rides along while you shop for a used car on Facebook
Marketplace. It scores every listing against comparable **asking** prices, flags
the risks, and hands you the questions to ask the seller — what similar ones
ask, what is documented to fail on that generation, and what service the
odometer says is overdue.

The product is not another listings site. The value is **triage and
preparation**: telling you which three of two hundred listings are worth your
evening, and what to ask when you get there.

It writes no messages, sends none, and never names a price to offer. That is a
product decision, not a missing feature — see *Negotiation is a script* below.

---

## Why this shape

Two hard constraints drove the architecture. Both are worth understanding before
touching the code, because they explain choices that otherwise look arbitrary.

**There is no Facebook Marketplace API.** Meta doesn't publish one. Third-party
"Marketplace APIs" on RapidAPI are unauthorized scrapers with a billing page
attached — same fragility, plus a vendor who can vanish and a bill per call. We
rejected that path.

**Facebook OAuth cannot send messages.** OAuth gives us `public_profile` and
`email` and nothing else. The Messenger API serves Pages replying to customers,
not people DMing sellers. Any design where our server messages a seller on the
user's behalf is not buildable.

The extension resolves both. It runs in the user's own browser, under their own
session, on pages they're already entitled to see. (An earlier draft leaned on a
content script filling the Messenger composer. That is no longer part of the
design — the product does not compose messages at all.)

To be precise with each other: **this doesn't eliminate scraping, it relocates
it.** We still parse Facebook's payloads. What changes is that it happens
client-side under the user's own session, which is a far better legal and
operational posture — the ad-blocker model — not an exemption.

---

## Product scope

### v1 — the overlay

The user browses Marketplace normally. We enrich what's already on their screen.

| Feature | What it does |
| --- | --- |
| Inline deal badge | Score + dollar delta injected onto each listing card in the results grid |
| Detail panel | Comps used, price-vs-market delta, days on market, price-drop history, risk flags |
| Risk flags | Missing maintenance records, rust mentions, salvage/rebuilt language, odometer inconsistencies, dealer-posing-as-private |
| Seller script | Per car: where the price sits against similar asks, documented faults for that generation, service the odometer implies, and the questions those imply |
| Saved criteria | Budget, max km, year range, radius — drives the Fit score and mutes listings that don't qualify |

**Explicitly not in v1:** background polling, push alerts, image analysis,
autonomous negotiation, financing, trade-in, inspection scheduling. Each is
deferred for a stated reason below.

### Why overlay-first instead of alerting

Alerting requires the extension to fetch Marketplace on a timer while the user
isn't looking. That is exactly the behavior Meta's enforcement targets, and the
account that gets banned is the user's personal Facebook account — a real harm
we'd be creating on their behalf.

The overlay has zero automation risk, ships sooner, and — critically — **browsing
is ingestion**. Every user who shops builds the comp corpus that makes the scores
good. Background polling becomes an opt-in v2 feature with unmissable consent,
not a default.

### Negotiation is a script

*Settled 2026-08-15. This replaces the draft-and-approve design.*

We do not write the message. Per car, the product produces four things:

1. **Where the price sits** — median of similar asks, the 25th-to-75th range,
   days listed, price drops. Silent when the comp set is insufficient.
2. **What is documented to fail on that generation** — the cam phaser rattle on
   a 5.0 F-150, the N20 chain guides, the Cruze water outlet housing. Specific
   enough to check on a test drive.
3. **What service the odometer implies** — interval items that have come due at
   least once at this mileage.
4. **The questions those three imply**, each carrying why it is being asked, so
   the user can judge the answer rather than just collect one.

The reasoning is worth stating, because this looks like a smaller feature and
isn't. The draft flow needed a spending ceiling *because* it composed an offer —
we had built a guardrail against a risk we introduced ourselves. Handing over the
questions keeps the useful half and drops the liability: no message is written,
none is sent, no number is suggested, and "information, not advice" stops being
a position we defend and becomes structurally true.

It also degrades better. A draft has to say something about price; a question
list can ask *"how did you land on your price?"* and be complete. On the F-150
that produced the fake $12,450 saving, the script names no figure at all and
still runs to twelve questions.

---

## The scoring model

We split what an earlier draft merged into one number. Blending "cheap" and "good
car" into a single 0–100 makes an unreliable bargain and a fairly-priced gem both
land at ~70, and the user can't tell them apart.

- **Deal Score** — is this priced well? Price vs. comparable listings, days on
  market, price-drop history, seller type.
- **Fit** — is this the car they asked for? Budget, mileage, year, distance,
  reliability of the model.

Shown together, never averaged. And the headline number is the **dollar delta**,
not the score — "$1,400 below similar listings" is a claim we can defend;
"93/100" is false precision from weights we invented.

**Days on market is our best signal and it's free.** A car listed three weeks ago
with one price drop is leverage no LLM produces. It requires only that we store
snapshots over time — which is why the corpus comes first.

### Honest limits we design around

**Asking price ≠ sale price.** Our corpus is what sellers ask, not what cars sold
for. The UI says "vs. similar asking prices," never "market value." Getting this
wrong is how we lose trust permanently.

**PEI is a thin market.** Most make/model/year/trim cells will not have enough
comps. The system must widen the radius and year band, and then say "not enough
data" rather than guess. A confident wrong number is worse than an absent one.

**Cold start is real.** Extension-only means our first users get scores built on
almost nothing. Kijiji and AutoTrader are out of scope (settled 2026-08-14), so
density can only come from browsing more Marketplace — which makes the
depreciation curve load-bearing rather than one option among two.

---

## How it works

```
Chrome Extension (MV3)              Next.js on Vercel
  content script                      Mastra server
   intercepts GraphQL/JSON              Workflow: normalize → dedup → comps → score
  overlay UI                            Extraction: listing text → structured
   score, comps, flags   ──────────▶    Agent: research (known faults)
                            listing              │
                            facts only           ▼
                                              Postgres
```

### Parsing: read the payloads, not the DOM

Do not select on Facebook's CSS classes. They're obfuscated and rotate
constantly; that path is weekly firefighting.

Facebook ships listing data as JSON in the page and over GraphQL. The content
script patches `fetch` and XHR in page context and reads those payloads — far
more stable, and it exposes fields the rendered DOM never shows. Keep a DOM
fallback for when payload shapes shift, and alarm on parse-failure rate so we
learn about breakage from telemetry, not from users.

### What crosses the network

The extension sends **market facts only**: make, model, year, trim, price,
mileage, coarse location, first-seen, last-seen, URL hash, dealer flag.

It **never** sends seller names, profile links, seller ids, or message contents
to our server. That data is personal information under PIPEDA, and relaying it is
what would turn a defensible tool into a liability. Nothing we build reads or
writes a conversation with a seller, so there are no message contents to leak.

**Amended 2026-08-14: listing photos are sent and stored.** These are the
photos of the vehicle from the listing — what the dashboard displays so a car
looks like a car rather than a row in a table.

We store Facebook's CDN **URL, not the image**. Worth knowing: those URLs are
signed and expire after hours or days, so a blank image is expected rather than
a bug, and re-ingesting a listing refreshes it.

Seller profile photos are a different field and are not included.

---

## Stack

One language end to end. The extension is TypeScript, so the backend is too.

- **Extension** — Chrome MV3, TypeScript
- **App + API + auth** — Next.js on Vercel; email magic-link or Google (not
  Facebook OAuth — it buys us nothing and requires Meta app review we won't pass)
- **Agents** — Mastra (TypeScript; v1.0 shipped January 2026)
- **Database** — Postgres on Supabase or Neon, including Mastra's memory and
  workflow state
- **Monitoring** — Sentry

**Deliberately absent:** Python, FastAPI, Celery, Redis, S3, ECS, Terraform,
RapidAPI. Each was in the first draft; none earns its keep before we know the
valuations work. Add them when something actually hurts.

---

## How we use Mastra

Mastra is organized around agents, workflows, tools, memory, RAG, and evals. Two
of its primitives fit this product unusually well — and there's one failure mode
we need to name out loud.

**Structured output is most of what we need from a model.** Listing text →
fields, and description → risk flags with the sentence that triggered each. Both
are one call with a schema, not a conversation.

**The research agent is the one genuinely agentic piece.** "What is documented to
fail on a 2012 N20 328i" is retrieval plus judgement, and it must cite what it
found — an unsourced fault claim is exactly the confident-wrong-answer failure we
refuse everywhere else.

### The rule: most of this is not agentic

Adopting an agent framework tempts you to make everything an agent. Do not.
Dedup, comps, price delta, days on market, mileage adjustment, filtering, and
scoring are deterministic — make them agents and we get a valuation engine that's
slow, expensive, and returns a different number every run.

| Layer | Implementation |
| --- | --- |
| normalize → dedup → comps → score | `createStep` workflow, plain TypeScript inside, Zod at the boundaries |
| listing text → structured fields | One structured-output call, with regex/heuristic fast paths first — most titles parse without a model |
| known faults for a generation | A real agent, with retrieval and required citations |

**No model output reaches the user as a price.** Comps, deltas, and ranges are
computed in plain TypeScript. The one thing a model contributes to the script is
prose about known faults, and that is checkable against a source.

**Keep domain logic outside Mastra.** Valuation, dedup, and scoring live in plain
modules that Mastra calls. Mastra is young; if we need to leave, that should be a
day of rewiring, not a rewrite. Don't hardcode a model provider either — Mastra
routes across OpenAI, Anthropic, and Google, and we should evaluate on our own
listings once we have ~100 labeled examples.

---

## Data model

Fields the first draft was missing are marked `** new` — several are
load-bearing.

```
Listing
├── vehicle       make · model · year · trim
├── price
├── mileage
├── location      coarse
├── source        marketplace + external id
├── first_seen    ** new — days on market
├── last_seen     ** new
├── price_history ** new — drops are leverage
├── sold_at       ** new
├── is_dealer     ** new — changes both the math and the script
├── vin           ** new — rare, but unlocks history when present
└── raw_payload   ** new — we will re-parse history after improving the parser

Analysis
├── deal_score · fit_score · price_delta
├── comps_used · comp_confidence
└── risk_flags

Script                        (derived, not stored — rebuilt from the listing)
├── comps       median · p25 · p75 · confidence
├── faults      per generation, with sources
├── service     interval items due at this odometer
└── questions   each with why it is asked
```

**Dedup deserves real engineering.** Same car relisted after a price drop,
cross-posted, spammed by dealers. Get it wrong and the comp corpus is garbage,
which poisons every score in the product.

**Ask for the VIN first.** Most private listings omit it, but when we have one
it's the single highest-value data point in used cars. It is question #1 in every
script, and it is why the script exists at all — one message to the seller that
gets a VIN is worth more than any number we can compute without it.

---

## Risks we're accepting

| Risk | Our position |
| --- | --- |
| Payload shape changes | Expected. Alarm on parse-failure rate; DOM fallback; fixable in hours because it's our code |
| Chrome Web Store review | An extension reading facebook.com and transmitting off-device gets scrutiny. Narrow permissions, clear privacy policy, no remote code (MV3 bans it anyway) |
| Account enforcement | Near zero in v1 — no automation. Any future background polling ships with explicit consent, never on by default |
| Thin comps | Show "not enough data" rather than guess. The script stays useful without a number — it asks about price instead of stating one |
| Liability on advice | Structural, not a disclaimer: we state what similar cars ask and what to ask about, and never compose an offer or a message |
| Fault claims that are wrong | The research agent must cite. An uncited "these blow head gaskets" is worse than silence, and the user cannot check it |

---

## Open decisions

1. **Is background polling ever on the table?** It changes consent and UX design
   from day one, so we decide now, not later.
2. **Where do fault claims come from?** A curated table is checkable and small; a
   retrieval agent scales but has to cite. We are shipping the table first.
3. **Does the spending-ceiling concept survive?** It existed to gate an offer we
   no longer make. `packages/core/src/limits.ts` still implements it.

---

## Milestones

**M0 — Corpus.** Extension read path + Postgres schema. Listings flowing in with
`first_seen` / `last_seen` / `price_history` / `is_dealer` / raw payload. No AI.
Ship a dumb median-of-comps number on screen.

> This is the gate. Within two weeks it tells us whether credible valuations are
> possible in a market as thin as PEI — the question the entire product rests on.
> Agents and negotiation flows are worth nothing if the comp data can't support a
> number.

**M1 — Overlay.** Deal + Fit scoring, risk flags, detail panel, saved criteria.

**M2 — The script.** Research agent for known faults with citations, service
intervals from the odometer, and the question set generated per car. Replaces the
draft-and-approve design that M2 originally described.

**M3 — Reach.** Price-history views, opt-in background alerts.
