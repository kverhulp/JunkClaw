# Extraction hit rate — 2026-08-15

Roadmap M0 #5 asks for this number because it decides whether
`listing-extractor` needs a model fallback at all. Measured, not estimated.

## Method

`extractVehicle` from `packages/core` run against every car title in the M0
spike corpus — the 106 rows collected around Moncton, less the one parts
listing and three powersports the port skips. No fixtures; the real titles.

## Result

| | | |
|---|---|---|
| titles | 102 | |
| **exact** | **102** | **100.0%** |
| partial | 0 | 0.0% |
| missed | 0 | 0.0% |

## What it implies

**Do not build the model fallback in `listing-extractor`.** The regex fast path
in `packages/core/src/title.ts` parses every title in the sample, and extraction
is the one place cost scales with browsing — every listing scrolled past would
hit it. Paying a model for a step that is already at 100% is the worst trade
available.

The roadmap makes this conditional already: *"Only if M0's regex hit rate proved
it necessary."* It did not.

## What this does not say

The sample is one region, one category, and every row is a **grid** payload, so
these are Marketplace's own generated titles ("2014 BMW 3 Series") rather than
free-typed ones. Seller-written titles on detail pages are messier and are not
represented here. Re-measure if the corpus ever widens to a source where sellers
type their own title.

It also says nothing about *trim*: `vehicle_trim_display_name` was empty on 6/6
sampled detail pages, so trim is absent rather than mis-parsed. Bucketing stays
on make/model/year.
