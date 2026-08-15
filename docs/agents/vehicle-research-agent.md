# VehicleResearchAgent

Status: **designed, not built.** Written 2026-08-14 so the reasoning survives.

Answers the question the user actually has in front of a listing — *is this a
good deal, and what goes wrong with this car?* — by researching the vehicle
rather than by computing over our own corpus.

---

## Why this exists

M0 measured what our corpus can support, against 66 real listings ingested live
from the PEI/Maritimes vehicles grid:

| | |
| --- | --- |
| listings | 66 |
| distinct make/model | 43 |
| **models with exactly one listing** | **33 (77%)** |
| scoreable today (same model, ±2yr, ≥3 peers) | 12/66 (18%) |
| scoreable with the year band deleted | 18/66 (27%) |

Own-corpus comps cannot carry this market. The long tail is singletons, and
corpus growth does not fix it — the comparable cars are not there to compare
against. That is the finding M0 existed to produce.

Two consequences drive this design:

1. **We need an external value anchor.** Most cards otherwise read "not enough
   data", which is honest but useless to someone deciding whether to drive an
   hour to see a truck.
2. **We can never generate transaction data ourselves.** Every listing we see is
   an asking price — someone's opening bid. No amount of scrolling converts that
   into what cars *sold* for. This is a structural ceiling, not a corpus-size
   problem.

---

## What it does

Three questions per vehicle, in one agent:

```
VehicleResearchAgent
  ├─ market value      what does this model-year actually sell for?
  ├─ common problems   what fails on this model-year, per owners and regulators?
  └─ questions to ask  what the above implies you should ask this seller
```

The third output is the one that makes the first two actionable. "Known for
timing chain failure before 150k" becomes "ask whether the timing chain has been
done" — a question the user can put in a message, which is where the product
ends up anyway.

### Boundaries

- **Per-vehicle, user-initiated, low-volume.** It researches the car in front of
  the user. It is not a crawler and must never be turned into one — see
  *Non-goals*.
- **Reads market facts only.** Like every other agent here, it can be handed a
  vehicle, a price, and a coarse location. It cannot be handed a seller's name,
  profile, photos, or message text, because nothing upstream ever stored them.
- **The price ceiling stays in `core`.** No agent, including this one, may
  produce the number that bounds a negotiation.

---

## Data sources

| Source | Cost | Coverage | Gives us | Status |
| --- | --- | --- | --- | --- |
| [VinAudit Canada](https://data.vinaudit.com/market-values-api) | **Trial: 100 queries free**, then $100/mo + $0.10/query | Canada, CAD | Market value from real **sales transactions** | Unverified — needs a key |
| NHTSA complaints + recalls | Free, open, no key | US-market vehicles (most models sold in Canada) | Owner-reported failures, recalls, investigations | Not integrated |
| NHTSA vPIC | Free, open, no key | North America | year/make/model/trim catalog | Not integrated |
| Web search | Per-model | Global | Forum consensus, reviews, corroboration | Not integrated |
| Our corpus | Free | PEI/Maritimes | **Local asking prices** — the local correction | Built |

### On VinAudit specifically

Confirmed from the docs: it takes **year/make/model/trim without a VIN**
(`id=2017_toyota_rav4_le`, `country=canada`). That matters more than price —
Marketplace sellers rarely post a VIN, so a VIN-only API would be useless to us
at any cost. The published demo key returns `invalid_key`, so **output quality is
unverified**; the first real key should be spent on the awkward end of the
corpus, not the easy end.

### Kelley Blue Book is not an option

Not a licensing preference — a correctness one. **KBB is US-only**; Kelley Blue
Book Canada was wound down, and the Canadian incumbent is Canadian Black Book.
US values reflect a different market, currency, and rust exposure. Showing them
to someone in Charlottetown would be confidently wrong. KBB also has no
self-serve API (B2B contract; their REST service is in limited pilot), and
Canadian Black Book is sales-gated with no published pricing.

---

## The query budget is the hard constraint

**The model set is open-ended.** 43 distinct models appeared in the first hour of
browsing; real use will produce far more. Against a 100-query free trial, this is
the binding constraint on the whole design — not latency, not model quality.

So the cache is not an optimisation, it is the architecture:

```
listing ──▶ normalise (vPIC) ──▶ cache key ──▶ HIT  ──▶ value
                                     │
                                     └──────▶ MISS ──▶ budget? ──▶ fetch, store
                                                          │
                                                          └─ exhausted ──▶ degrade
```

**Cache key:** normalised `(year, make, model, trim)` — never the listing id.
Two 2017 WRXs are one query, forever. Values move monthly at most, so a long TTL
is correct; a stale book value is a far smaller error than no value.

**Normalisation is what makes the cache work.** Our extractor currently produces
`ford/f 150`, `bmw/3`, `cf/moto` — each a distinct key that shouldn't be. vPIC
is free and fixes this, which means it pays for itself in saved queries before
it does anything for match quality.

**Degradation must be explicit.** When the budget is gone, fall back to
corpus comps, then to a depreciation estimate — and *say which one you're
showing*. A demo that silently swaps a licensed value for a guess is the one
failure mode worth engineering against.

**Pre-warm before any demo.** Pull the values, commit the fixture, let the demo
read the cache. Every demo that dies live dies because it needed the network.

---

## Honesty: two numbers, two labels

A book value and our corpus measure different things and must never share one
label:

```
Book value      $18,400   ← transaction data: what these sell for, nationally
PEI asks        $16,200   ← our corpus: what this market opens at
This listing    $14,900   ← $3,500 under book · $1,300 under local asks
```

The local delta is the part no vendor sells, and it is the reason this product
is worth building. Buying the anchor makes our data valuable, not redundant.

This preserves the rule the whole schema is built around: **our number means
*asking* prices.** A book value is a different claim. Both are defensible;
conflating them is how the product loses trust permanently, and it is a one-word
mistake to make.

---

## Tool surface

New tools, alongside the existing `getListingFacts` / `getComps`:

| Tool | Returns |
| --- | --- |
| `getBookValue` | Cached market value for a normalised vehicle, plus source and as-of date. Returns `null` on miss rather than guessing — the caller decides how to degrade. |
| `getKnownIssues` | Complaints, recalls, and investigations for a model-year, with counts and the regulator's own text. |
| `normaliseVehicle` | Raw make/model → catalog make/model/trim, via vPIC. |
| `searchVehicleWeb` | Corroborating public discussion for a model-year. |

Each returns market facts and nothing else, consistent with `tools/index.ts`.
`getBookValue` returning `null` is deliberate: the same reasoning that keeps
`dealScore` null rather than inventing weights.

---

## Non-goals

- **No bulk harvesting of a valuation database.** Rebuilding a vendor's core
  asset is a different act from reading a page the user opened, and the
  distinction is what keeps our Facebook posture defensible. It also fails on
  its own terms: value is a surface over mileage and condition (~3M points),
  republished monthly, behind active blocking — an enormous permanent treadmill
  to serve a few dozen lookups.
- **No background fetching from the extension.** Unchanged and non-negotiable.
- **No seller identity**, here or anywhere.

---

## Open questions

1. **Do VinAudit's terms permit displaying values to consumers in a third-party
   extension?** Not published on their pricing page. Valuation providers restrict
   exactly this. **This is more likely to kill the approach than the price is,
   and should be asked during the trial, before anything is built on it.**
2. Is VinAudit's Maritime coverage any good? Powersports, farm trucks, and
   20-year-old imports are where a national dataset usually thins out — and
   they are a real share of this feed.
3. Does NHTSA complaint data map cleanly onto Canadian-market trims?

---

## Next steps

1. Free trial key → pull values for every distinct model in the corpus → commit
   the fixture. Zero cost, and it makes the demo network-independent.
2. vPIC normalisation. Free, helps under every option, independent of how the
   licensing question lands.
3. Build the agent against the fixture. The work is identical whether values
   ultimately come from the trial, a paid tier, or an open dataset.

The *known issues* half needs no key and no budget at all — NHTSA is open data.
It can be built first, and it is the more novel half of the demo.
