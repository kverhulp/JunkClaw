Schema Restrictions
Purpose

Schemas in packages/schema are the canonical source of truth for constrained values used throughout JunkClaw.

When a field represents a country, currency, or service, its accepted values must be restricted to the corresponding schema. Agents must not introduce ad-hoc strings, regular expressions, or locally defined lists for these fields.

Rules
Countries

Any field representing a country must use the country schema from packages/schema.

Do not:

Accept arbitrary strings for country values.
Define a separate list of country codes.
Duplicate the ISO country-code validation in another package.
Use a different country-code format without an explicit contract decision.

Use the canonical country schema so that all parts of the application agree on the same set of valid country values.

Currencies

Any field representing a currency must use the currency schema from packages/schema.

Do not:

Accept arbitrary three-letter strings as currencies.
Define a separate list of currency codes.
Duplicate ISO 4217 validation in another package.
Infer validity from formatting alone.

For example, checking that a value matches ^[A-Z]{3}$ is not sufficient. The value must be accepted by the canonical currency schema.

Services

Any field representing a listing service or other known service must use the service schema from packages/schema.

Do not:

Accept arbitrary strings when the field represents a known service.
Define service names independently in agents, core logic, or UI code.
Duplicate the service allowlist in multiple locations.
Silently introduce a new service without updating the canonical schema.

If a new service needs to be supported, update the service schema first and then update consumers as necessary.

Canonical Contract

The intended dependency direction is:

packages/schema
       ↓
packages/core
       ↓
packages/agents

packages/schema owns the allowed values. Other packages consume those schemas; they do not redefine them.

For example:

import {
  countryCodeSchema,
  currencyCodeSchema,
  serviceSchema,
} from "@junkclaw/schema";

A contract should compose these schemas rather than recreating their validation:

const listingSchema = z.object({
  country: countryCodeSchema,
  currency: currencyCodeSchema,
  listingService: serviceSchema,
});
Updating Allowed Values

When a country, currency, or service needs to be added or removed:

Update the corresponding schema in packages/schema.
Update or regenerate its source data if the schema is generated.
Update tests for the schema.
Let consumers use the updated schema rather than adding local exceptions.

This ensures that validation remains consistent across the extension, core application, agents, and any other consumers of the contract.

Agent Guidance

When you encounter a country, currency, or service field, look for the corresponding schema in packages/schema before defining the field.

The schema is the contract. Do not weaken it by replacing it with string, duplicating its values, or implementing a second validation mechanism.

---

## The listing schema

**`listing.ts` → `ListingFactsSchema`** is the only listing schema. It is what
the extension sends, what `/api/ingest` validates, and what the corpus stores.

It is a `strictObject` because that is what keeps seller PII from riding along in
an unknown key — see the build plan, *What crosses the network*. Do not relax it,
and do not replace it without replacing its tests.

A second, multi-source shape (`vehicleListingSchema`) was proposed and removed:
two listing schemas in one package drift, and the one nothing consumes is the one
that rots. When Kijiji and AutoTrader collection arrives, extend this schema
rather than adding a rival.

## Applying these rules to the live contract

The policy above is now enforced in `ListingFactsSchema` rather than only stated:

- `location.country` uses `countryCodeAlpha2Schema`, not `z.string().length(2)`.
  A length check accepts `"XX"`.
- `currency` uses `SupportedCurrencySchema`, drawn from the canonical ISO 4217
  list and narrowed to what the comp math actually supports.
- `service.ts` was empty. It now holds the canonical service list, and
  `SourceSchema` is an alias for it rather than a second enum — a test fails if
  someone reintroduces a copy.
