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
2. **Kijiji / AutoTrader collector.** No longer optional — the only way to reach
   the density a stable curve fit needs.
3. **Keep collecting.** Every session improves the fit.

**[W]** **I would hold M1 (the overlay).** Showing a $12,450 saving that isn't
real would burn trust on first use, and first use is the only cheap chance we
get. Valuation quality gates the UI, not the other way round.

---

## Open decisions — 2026-08-14

**[W]** **Kijiji/AutoTrader collection.** A different posture from the extension:
server-side, on other sites' terms. Needs a deliberate call, not a drift into it.

**[W]** **Powersports.** Motorcycles and ATVs are being collected and separated
now. Whether they are in scope as a product is unanswered — they need their own
comp buckets either way, since a Yamaha and a Civic are not comparable in price,
depreciation, or mileage expectations.

**[W]** **Background polling.** Currently none, so there is no account risk. Any
change needs explicit, unmissable user consent — the account that gets banned is
the user's, not ours.

**[W]** **Product name.** "JunkClaw" is the repo, not a decision.

---

## Standing limits

**[W]** Asking price ≠ sale price. The corpus is what sellers ask, not what cars
sold for. The UI says "vs. similar asking prices", never "market value".

**[W]** Where data is thin, the system says so rather than guessing. A confident
wrong number loses the user permanently; an absent one does not.
