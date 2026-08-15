# Build plan — working notes

Running commentary on [`../JunkClaw-Build-Plan.md`](../JunkClaw-Build-Plan.md),
kept separate so the plan itself stays the clean statement of intent and this
stays the argument behind it.

Everything below is dated and attributed. Where a note contradicts the plan, the
plan wins until someone edits the plan.

## Legend

| Tag | Author |
|---|---|
| **[W]** | Wanhar |
| **[K]** | Kody |

Every note currently in this file is **[W]**. Tag new ones as you add them.

---

## Why an extension — 2026-08-14

**[W]** Facebook has no Marketplace API, and Facebook Login cannot send messages
to sellers. Both kill the server-side design outright. Running in the user's own
browser solves both — and it is the only reason the negotiation feature is
buildable at all.

**[W]** Worth being precise with each other: this **relocates** scraping rather
than eliminating it. We still parse Facebook's payloads; what changes is that it
happens client-side under the user's own session. Better legal footing, same
obligation to handle breakage.

---

## What the first collection run found — 2026-08-14

**[W]** 106 listings from one browsing session around Moncton, NB. Full detail in
[`../findings/2026-08-14-m0-field-findings.md`](../findings/2026-08-14-m0-field-findings.md).

**[W]** The encouraging number is listing age:

| Days listed | Count |
|---|---|
| 0 | 12 |
| 1 | 9 |
| 2 | 11 |
| 3–7 | 21 |

Live market flow, not a stale archive. Days-on-market is the strongest
negotiation signal we have and it arrives free with every capture.

### The gate: 17% of cars could be priced

**[W]** 16 of 93 comp-eligible cars had enough comparables. Five buckets reached
three or more. And part of that 17% is wrong:

```
2017 Ford F-150   ask $18,999   median $31,450   delta −$12,450
```

That bucket spans 2017–2021. The "saving" is four model years of depreciation,
not a bargain.

### Two problems, and only one is about volume

**[W]** **Volume.** The Maritimes will not produce dense per-year buckets for most
models at any realistic collection rate. Common cars fill; a 2011 Mazda3 in
Charlottetown may never have three same-year comps.

**[W]** **Method.** Median-of-bucket cannot work in a thin market — widening the
year band to reach `MIN_COMPS` buys coverage by destroying the comparison. The
fix is a depreciation and mileage curve fitted across the corpus rather than a
median within a cell. Every listing then contributes, instead of only those in
dense cells.

**[W]** This is the one finding I would push back on the current design over.
`valuation.ts` and the `WIDENING_LADDER` in `comps.ts` are both median-shaped
today, and the run says that shape does not survive contact with PEI-sized data.

---

## What I would do next — 2026-08-14

**[W]** In order:

1. **Depreciation + mileage adjustment.** Turns 17% coverage into most of the
   corpus and fixes the F-150 problem. Deterministic, no model in the loop.
2. **More Marketplace collection.** With other marketplaces out of scope, density
   can only come from browsing more. That makes the curve fit load-bearing rather
   than optional.
3. **Keep collecting.** Every session improves the fit.

**[W]** **I would hold M1 (the overlay).** Showing a $12,450 saving that isn't
real would burn trust on first use, and first use is the only cheap chance we
get. Valuation quality gates the UI, not the other way round.

---

## Settled — 2026-08-14

**[W]** **Kijiji and AutoTrader are out of scope.** One source: Facebook
Marketplace, read through the user's own session by the extension. The schema's
`Source` enum still lists the other two, because that is a data contract and
widening it later is cheaper than migrating rows — but nothing in the product
claims them, and the site no longer advertises three sources when one collects.

The consequence is not free: density can now only come from browsing more
Marketplace, which makes the depreciation curve load-bearing rather than one
option among two.

**[W]** **The product is AutoScout.** JunkClaw remains the repo name; only
visible copy changed.

---

## Settled — 2026-08-15

**[W]** **Negotiation produces a script, not a message.** The feature no longer
drafts outreach and no longer proposes a number. It produces, per car:

1. Where the price sits against **similar asks** — median, the 25th-to-75th
   range, days listed, price drops. Silent when the comp set is insufficient.
2. **Documented faults for that generation** — the cam phaser rattle on a 5.0
   F-150, the N20 chain guides, the Cruze water outlet. Specific enough to check
   on a test drive.
3. **Service the odometer implies** — interval items that have come due at least
   once at this mileage.
4. The **questions** those three imply, each carrying why it is being asked.

**[W]** Why this is better and not just smaller. The draft flow needed a
spending ceiling *because* it composed an offer — we built a guardrail for a
risk we had introduced ourselves. Handing over the questions keeps the useful
half and drops the liability: no message is written, none is sent, no number is
suggested, and the "information not advice" line stops being something we have
to defend and starts being structurally true.

**[W]** It also survives thin comps far better. A draft has to say *something*
about price; a question list can ask "how did you land on your price?" and be
complete. On the F-150 — the car that produced the fake $12,450 saving — the
script now names no figure at all and still runs to twelve questions.

**[W]** **What this leaves stranded.** `POST /api/negotiate`, the
`negotiateWorkflow` in `packages/agents`, `NegotiationLimits` /
`DraftMessageSchema` in `packages/schema`, and the ceiling check in
`packages/core/src/limits.ts` all still implement the draft-and-approve design.
Nothing in the frontend calls them. They are M2 work that now needs rewriting
rather than finishing, and someone should decide whether the ceiling concept
survives at all — with no offer being made, there is nothing left for it to
gate.

---

## Open decisions — 2026-08-14

**[W]** **Powersports.** Motorcycles and ATVs are being collected and separated
now. Whether they are in scope as a product is unanswered — they need their own
comp buckets either way, since a Yamaha and a Civic are not comparable in price,
depreciation, or mileage expectations.

**[W]** **Background polling.** Currently none, so there is no account risk. Any
change needs explicit, unmissable user consent — the account that gets banned is
the user's, not ours.

**[W]** **The photo contract.** `ListingFacts` is a `strictObject` guarding the
PII boundary and carries no image field at all, but the catalogue is specified
as an image grid. The frontend currently holds `photos` in a view model of its
own rather than pretending the contract supports it. Either add
`vehiclePhotoUrls` to the schema deliberately, or drop imagery from the grid —
but not by accident.

---

## Standing limits

**[W]** Asking price ≠ sale price. The corpus is what sellers ask, not what cars
sold for. The UI says "vs. similar asking prices", never "market value".

**[W]** Where data is thin, the system says so rather than guessing. A confident
wrong number loses the user permanently; an absent one does not.
