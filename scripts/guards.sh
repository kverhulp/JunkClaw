#!/usr/bin/env bash
#
# Repo invariants that a type-checker or a unit test can't state on its own.
#
# Each guard here exists because the failure it catches is silent: the build
# stays green, or the code compiles, and the damage shows up somewhere far from
# the change. Run locally with ./scripts/guards.sh; CI runs it before lint.
set -uo pipefail

cd "$(dirname "$0")/.."

failures=0

fail() {
  printf '\n\033[31m✗ %s\033[0m\n' "$1"
  shift
  printf '  %s\n' "$@"
  failures=$((failures + 1))
}

pass() {
  printf '\033[32m✓\033[0m %s\n' "$1"
}

# ---------------------------------------------------------------------------
# 1. The PII boundary must stay strict, and seller identity must stay out.
#
# ListingFactsSchema is the only shape the extension may send us. As a
# strictObject, an added seller name or profile link is a parse failure.
# Downgrade it to z.object() and unknown keys are silently accepted — the PIPEDA
# problem the design exists to prevent, arriving without a single test turning red.
#
# Vehicle PHOTOS are allowed (decision 2026-08-14) — the dashboard displays
# them. Photos of a car are not personal information; the seller is.
# ---------------------------------------------------------------------------
if grep -q 'export const ListingFactsSchema = z.strictObject(' packages/schema/src/listing.ts; then
  pass "ingest DTO is a strictObject (PII boundary holds)"
else
  fail "ListingFactsSchema is no longer a z.strictObject" \
    "packages/schema/src/listing.ts must use z.strictObject so seller PII can't" \
    "ride along in an unknown key. See docs/JunkClaw-Build-Plan.md → What crosses the network."
fi

seller_fields=$(grep -nE '^\s*(sellerName|sellerId|sellerProfileUrl|sellerProfile|profileUrl)\s*:' \
  packages/schema/src/listing.ts 2>/dev/null || true)
if [ -n "$seller_fields" ]; then
  fail "the ingest DTO names a seller-identity field" \
    "Vehicle photos are allowed; the seller as a person is not." \
    "$seller_fields"
else
  pass "ingest DTO carries no seller-identity field"
fi

# ---------------------------------------------------------------------------
# 2. The spending ceiling must stay out of reach of a model.
#
# enforceCeiling lives in packages/core precisely so no model is in its call
# stack. If core ever imports Mastra or the AI SDK, that guarantee is gone. The
# eslint rule says the same thing — this catches the case where someone silences
# the rule instead of heeding it.
# ---------------------------------------------------------------------------
if grep -rnE 'from "(@mastra/|ai"|next)' packages/core/src >/dev/null 2>&1; then
  fail "packages/core imports an agent framework" \
    "core is deterministic domain logic and holds the code-enforced price ceiling." \
    "Offending imports:" \
    "$(grep -rnE 'from "(@mastra/|ai"|next)' packages/core/src || true)"
else
  pass "packages/core is free of Mastra/Next imports"
fi

# ---------------------------------------------------------------------------
# 3. No .js extensions on relative imports.
#
# The packages ship TypeScript source, and Turbopack will not map ./foo.js to
# ./foo.ts — the Next build dies with "The module has no exports at all", which
# reads like a missing export rather than a resolution problem. Cost an hour once.
# ---------------------------------------------------------------------------
# Scanned via git ls-files so generated output (.next/types, .wxt, .output) is
# excluded by construction rather than by an exclude list that drifts.
js_imports=$(git ls-files -z '*.ts' '*.tsx' \
  | xargs -0 grep -nE 'from "\.\.?/[^"]*\.js"' 2>/dev/null || true)

if [ -n "$js_imports" ]; then
  fail "relative imports carry a .js extension" \
    "Turbopack can't resolve ./foo.js to ./foo.ts in a source-shipped package." \
    "Drop the extension (moduleResolution: bundler makes it correct):" \
    "$js_imports"
else
  pass "relative imports are extensionless"
fi

# ---------------------------------------------------------------------------
# 4. No real .env committed.
# ---------------------------------------------------------------------------
tracked_env=$(git ls-files | grep -E '(^|/)\.env(\.|$)' | grep -v '\.env\.example' || true)
if [ -n "$tracked_env" ]; then
  fail "an environment file is tracked by git" "$tracked_env"
else
  pass "no .env files tracked"
fi

# ---------------------------------------------------------------------------
# 5. No background polling of Marketplace.
#
# v1 enriches pages the user already opened. A timer that fetches Marketplace
# while they aren't looking is the behaviour Meta's enforcement targets, and the
# account that gets banned is the user's own. If polling ever ships it is
# opt-in with explicit consent — and this guard gets updated deliberately.
# ---------------------------------------------------------------------------
polling=$(grep -rnE '(setInterval|alarms\.create)' apps/extension/entrypoints apps/extension/lib 2>/dev/null || true)
if [ -n "$polling" ]; then
  fail "the extension schedules recurring work" \
    "Background polling of Marketplace risks a ban on the USER's Facebook account." \
    "If this is deliberate opt-in alerting, update this guard in the same commit:" \
    "$polling"
else
  pass "extension schedules no recurring work"
fi

printf '\n'
if [ "$failures" -gt 0 ]; then
  printf '\033[31m%d guard(s) failed\033[0m\n' "$failures"
  exit 1
fi
printf '\033[32mAll guards passed\033[0m\n'
