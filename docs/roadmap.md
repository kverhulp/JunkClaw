# Roadmap — M0 to M2

Ordered goals to finish each milestone, derived from the 36 unimplemented sites
in the codebase (`git grep "not implemented — M"`). Every goal names where it
lives and what "done" means, so progress is checkable rather than felt.

**Product decisions live in [`JunkClaw-Build-Plan.md`](JunkClaw-Build-Plan.md);
technical ones in [`superpowers/specs/`](superpowers/specs/). This file is only
sequencing.**

---

## M0 — Corpus · *the gate*

**M0 is not a feature milestone.** It exists to answer one question: *can a
market as thin as PEI support a credible valuation?* Everything below is in
service of getting a defensible number on screen; if the answer turns out to be
no, M1 and M2 are wasted work regardless of how well they're built.

**Exit criterion:** a real dollar delta on real PEI listings, and a written
answer to the gate question — including "no" or "only for these segments".

**No AI in M0.** The build plan is explicit. Extraction uses the regex fast path
only; titles it can't parse simply don't get comped. This keeps the gate cheap
and means a bad answer can't be blamed on a model.

| # | Goal | Where | Done when |
|---|---|---|---|
| ✅ 1 | Payload capture + parser | `apps/extension/lib/parse.ts` | Real captures parse; 33 tests |
| ✅ 2 | Ingest queue + URL hashing | `apps/extension/lib/queue.ts` | Burst → one request; nothing lost on failure |
| 3 | **Device token auth** | `apps/web/lib/auth.ts`, `packages/db` | A token in the options page authenticates ingest, bound to a `user` row. Forward-compatible with M1's magic-link — the schema is already multi-user, so this adds a credential, not a different model |
| 4 | **Corpus persistence** | `ingest-listing.persist`, `/api/ingest`, `packages/db/migrations` | Listings land in Postgres, idempotent on `(source, external_id)`; `first_seen` from Marketplace's `creation_time`; a `listing_snapshots` row on every price change |
| 5 | **Extraction (regex only)** | `ingest-listing.extract`, `listing-extractor.fastPathExtract` | Title → make/model/year/trim; mileage from `rawSubtitle`. Measure and record the hit rate — it decides whether M1 needs the model fallback at all |
| 6 | **Dedup (deterministic only)** | `ingest-listing.dedup`, `packages/core/dedup.ts` | Blocking + similarity wired; ambiguous pairs recorded but **not** adjudicated (that's an agent, and agents are M1) |
| 7 | **Corpus query tools** | `packages/agents/src/tools` | `searchCorpus`, `getListingHistory`, `getListingFacts` read real rows |
| 8 | **Median-of-comps number** | `/api/score`, `packages/core/comps.ts` | Dollar delta from same make/model/year within radius; `"insufficient"` when under 3 comps |
| 9 | **Badge matching** *(needs a browser session)* | `overlay.content.ts` | Each grid card shows its own delta, keyed by `urlHash`. Requires learning how a payload `id` maps to its DOM card **without CSS selectors** — cannot be done from a fixture |
| 10 | **Answer the gate question** | `docs/` | Written up with numbers: comp coverage by segment, how often we hit `"insufficient"`, whether the deltas look sane against listings you know |

**Deliberately deferred out of M0:** `parseFromDom` (write it after we've seen a
real shape change, not before), the model extraction fallback, every agent.

---

## M1 — Overlay

Turns a number into a product. Everything here assumes M0 said yes.

**Exit criterion:** you'd genuinely use it to shop.

| # | Goal | Where | Done when |
|---|---|---|---|
| 1 | **Real auth** | `apps/web/lib/auth.ts` | better-auth magic link + Google; "connect extension" page issues tokens |
| 2 | **Comp curation** | `comp-curator`, `score-listing.curate-comps` | Widening ladder walked deterministically; agent decides only *how far*, never the number |
| 3 | **Deal + Fit scoring** | `packages/core/scoring.ts` | Weights fitted against the corpus, not invented. Shown together, never averaged |
| 4 | **Risk flags** | `risk-analyst`, `score-listing.flag-risks` | Every flag carries its supporting quote |
| 5 | **Detail panel** | `apps/extension` | Comps used, delta, days on market, price-drop history, flags |
| 6 | **Saved criteria end to end** | `/api/criteria`, options page | Fit score reflects criteria; non-qualifying listings mute |
| 7 | **Dedup adjudicator** | `dedup-adjudicator` | Ambiguous pairs from M0 get resolved |
| 8 | **Model extraction fallback** | `listing-extractor` | Only if M0's regex hit rate proved it necessary |
| 9 | **Parse health telemetry** | `background.ts`, `parse-sentinel` | Failure *rate* alarms; sentinel proposes the mapping patch |
| 10 | **Eval harness** | `eval-judge` | ~100 labelled listings; provider choice made on numbers |

---

## M2 — Copilot

**Exit criterion:** you send a JunkClaw-drafted message to a real seller and it
reads like you wrote it.

| # | Goal | Where | Done when |
|---|---|---|---|
| 1 | **Negotiation drafting** | `negotiation-copilot`, `negotiate.draft` | Opener asks for the VIN; grounded in comps, not in "market value" |
| 2 | **Suspend / resume** | `negotiate.await-approval` | Run survives a function timeout, a closed laptop, and a redeploy |
| 3 | **Ceiling enforcement wired** | `negotiate.enforce-ceiling` | ✅ already written and tested — needs only to be reachable. Re-checked on user-edited drafts |
| 4 | **Composer fill** | `apps/extension/lib/composer.ts` | Fills the Messenger box. **Never sends.** Needs the contenteditable event dance |
| 5 | **Negotiation UI** | `apps/extension` | Draft, edit, approve, fill — with the rejection reason surfaced when the ceiling trips |

---

## Open decisions

Carried from the build plan, still unanswered. None block M0.

1. **Is background polling ever on the table?** Changes consent and UX design from
   day one. Current answer, encoded in `scripts/guards.sh`: no.
2. **Server-side Kijiji/AutoTrader collector?** M0's gate answer should decide
   this — if PEI Marketplace alone can't support a valuation, seeding from
   elsewhere stops being optional.
3. **Product name.** "JunkClaw" is the working directory.

## Infrastructure still owed

Neither blocks M0, both block anything deployed. See [`ci-cd.md`](ci-cd.md).

- Connect the repo in Vercel (root `apps/web`, include files outside root)
- `DATABASE_URL` as a GitHub **environment** secret, so production migrations
  can require a reviewer
