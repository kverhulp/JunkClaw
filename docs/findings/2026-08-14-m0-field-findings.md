# M0 field findings — 2026-08-14

Measured against live Facebook Marketplace, not inferred. A spike ran the full
path (browser → payload capture → Postgres corpus) and collected **106 listings**
from ordinary browsing around Moncton, NB. What follows is what the data said.

## Payload shapes

Listings arrive as JSON inside `<script type="application/json">` blocks. No DOM
scraping needed.

- **Grid** — 24 listings per payload, at
  `viewer.marketplace_feed_stories.edges[].node.listing`
- **Detail** — two variants, **116 and 123 keys**. The 116 variant omits most
  `vehicle_*` fields. A parser must handle both and degrade rather than assume.

Confirmed enum spellings: `vehicle_odometer_data.unit = "KILOMETERS"`,
`vehicle_seller_type = "PRIVATE_SELLER"`, `condition = "USED"`.
`listing_price.amount` is a **decimal string** (`"4200.00"`), not an integer.

A captured, sanitised detail payload is checked in at
`apps/extension/lib/__fixtures__/marketplace-detail.json`.

## Populated in practice

| Field | Notes |
|---|---|
| `creation_time` | Epoch seconds — days-on-market with no accumulation period |
| `strikethrough_price` | Price drops already made. Present on 10 of 24 grid listings |
| `vehicle_odometer_data` | 4/6 sampled detail pages |
| `vehicle_seller_type` | 4/6 |
| `redacted_description` | 6/6 |
| `location.latitude/longitude` | Exact coordinates — no geocoding needed |

## In the schema, empty in practice

Sampled across 6 detail pages; every one arrived unpopulated:

| Field | Consequence |
|---|---|
| `vehicle_title_status` | Salvage/rebuilt must be read out of the description |
| `vehicle_trim_display_name` | **No trim-level comps.** Bucket on make/model/year |
| `vehicle_identification_number` | Ask the seller; do not expect the field |
| `vehicle_carfax_report` | Same |
| `vehicle_number_of_owners` | Same |

**`fair_market_value_data` was empty on 7 of 7.** Facebook is not shipping its own
valuation, so the core value proposition is not preempted.

## Three traps

**The grid payload has no make or model.** Only `vehicle_make_display_name` on
detail pages carries it, and grid cards are the overwhelming majority of what
gets observed — in a 106-listing sample, exactly one row arrived with a
structured make. Without title parsing, comps have price, mileage, and year but
no idea what the car is. Hence `packages/core/src/title.ts`.

**`vehicle_condition` is null while a top-level `condition` says `USED`.** Read both.

**Detail payloads cannot be background-fetched.** A plain `fetch()` of an item URL
returns a ~900 KB app shell containing none of the listing fields; the payload
only materialises on real navigation or via the page's own GraphQL call. Detail
enrichment therefore only happens on pages the user actually opens — which rules
out server-side detail harvesting and reinforces the overlay-first design.

## Corpus contamination

Facebook files motorcycles and ATVs under Vehicles, and the general Marketplace
feed serves non-vehicles to the same content-script match pattern. Observed in
106 rows:

- **24 non-vehicles** — Pokémon cards, apartments, a Burger King lightbox
- **3 powersports** — a 1999 Yamaha YZF, a 2022 CFMOTO
- **1 parts listing** — `PARTING OUT 2013 SORENTO FWD`, $2.00, carrying a real
  make, model, year, and mileage
- **10 price outliers** — a 2015 Challenger at $1,234,567, a 2017 Charger at $1.00

All four categories look like ordinary cars to every field we store, and all four
move a median with nothing to warn you. Addressed by `classify.ts` and the
plausible-price bounds in `comps.ts`.

## The gate: 17% of cars could be priced

Of 93 comp-eligible cars, **16 had enough comparables** — five buckets reached
three or more (Civic 7, F-150 4, BMW 3-series 4, Focus 4, Elantra 4).

And part of that 17% is wrong:

```
2017 Ford F-150   ask $18,999   median $31,450   delta −$12,450
```

That bucket spans 2017–2021. The "saving" is four model years of depreciation,
not a bargain.

### What this implies for valuation

**Median-of-bucket cannot work in a thin market.** Widening the year band to reach
`MIN_COMPS` buys coverage by destroying the comparison — the exact failure mode
that loses a user permanently, because the number looks confident and is wrong.

The alternative is a **depreciation and mileage curve fitted across the corpus**
rather than a median within a bucket. A 2017 F-150 then gets compared against
2021s *with an adjustment*, and every listing contributes rather than only those
in dense cells. Still deterministic, still no model in the loop.

This is a design input for `valuation.ts` and the widening ladder in `comps.ts`,
not a change anyone needs to make today — but it is the reason more collection
alone will not get coverage above roughly a third.

## Encouraging signal

Listing age across the corpus:

| Days listed | Count |
|---|---|
| 0 | 12 |
| 1 | 9 |
| 2 | 11 |
| 3–7 | 21 |

Live market flow, not a stale archive. Days-on-market is the strongest
negotiation signal available and it arrives free with every capture.
