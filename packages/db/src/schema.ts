import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ *
 * Auth (better-auth's expected shape). Multi-user from day one, so
 * everything user-owned below is scoped by userId.
 * ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Extension credentials.
 *
 * M0 authenticates the extension with a token the user pastes into the options
 * page, bound to a `user` row. This is not a different auth model from M1's
 * magic link — the schema is multi-user either way — it is one credential type,
 * and better-auth adds the others on top.
 *
 * Only the SHA-256 of the token is stored. A leaked database should not hand
 * anyone a working credential.
 */
export const extensionTokens = pgTable(
  "extension_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull().default("Extension"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("extension_tokens_user_idx").on(table.userId)],
);

/* ------------------------------------------------------------------ *
 * The corpus. This is M0 — everything else waits on it.
 *
 * Note what is NOT here: no seller name, no profile link, no seller id, no
 * message bodies. The ingest DTO in @junkclaw/schema can't carry them and this
 * table has nowhere to put them. Vehicle photos ARE here as of 2026-08-14 — a
 * picture of a car is not personal information; the seller is.
 * ------------------------------------------------------------------ */

export const listings = pgTable(
  "listings",
  {
    id: text("id").primaryKey(),

    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    /** SHA-256 of the canonical URL. We dedupe on this and never store the link. */
    urlHash: text("url_hash").notNull(),

    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year").notNull(),
    trim: text("trim"),
    mileageKm: integer("mileage_km"),
    transmission: text("transmission").notNull(),
    drivetrain: text("drivetrain").notNull(),
    fuel: text("fuel").notNull(),
    /** Rare, and the highest-value field in used cars when present. */
    vin: text("vin"),

    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("CAD"),

    city: text("city").notNull(),
    region: text("region").notNull(),
    country: text("country").notNull(),

    /** Changes both the comp math and the negotiation script. */
    isDealer: boolean("is_dealer").notNull().default(false),
    description: text("description").notNull().default(""),
    /**
     * The listing's vehicle photos, for the dashboard. Facebook's CDN signs
     * these URLs and they expire, so treat a blank image as normal rather than
     * as data loss — re-ingesting the listing refreshes them.
     */
    photoUrls: jsonb("photo_urls").notNull().default([]),

    /** Days on market is derived from these two — our best signal, and free. */
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    /** Set when the listing disappears. Still asking price, not sale price. */
    soldAt: timestamp("sold_at", { withTimezone: true }),

    /** Kept so we can re-parse history after improving the parser. */
    rawPayload: jsonb("raw_payload").notNull(),

    /** Set when dedup folds this into another listing (relist, cross-post). */
    canonicalListingId: text("canonical_listing_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("listings_source_external_id_idx").on(table.source, table.externalId),
    index("listings_url_hash_idx").on(table.urlHash),
    // The comp lookup blocks on this; it is the hot path for scoring.
    index("listings_comp_block_idx").on(table.make, table.model, table.year),
    index("listings_vin_idx").on(table.vin),
    index("listings_last_seen_idx").on(table.lastSeenAt),
  ],
);

/**
 * Price history. One row per observed price change — drops are leverage, and
 * this table is the only reason we can say "listed 3 weeks ago, dropped once".
 */
export const listingSnapshots = pgTable(
  "listing_snapshots",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("listing_snapshots_listing_idx").on(table.listingId, table.observedAt)],
);

export const analyses = pgTable(
  "analyses",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    /** Null until Fit is computed — Fit is per-user, Deal is not. */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),

    priceDeltaCents: integer("price_delta_cents").notNull(),
    dealScore: integer("deal_score"),
    fitScore: integer("fit_score"),
    daysOnMarket: integer("days_on_market").notNull(),
    priceDropCount: integer("price_drop_count").notNull().default(0),

    compsUsed: jsonb("comps_used").notNull(),
    /** "insufficient" is a first-class value and the UI must render it as one. */
    compConfidence: text("comp_confidence").notNull(),
    riskFlags: jsonb("risk_flags").notNull().default([]),

    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("analyses_listing_idx").on(table.listingId, table.userId)],
);

export const savedCriteria = pgTable("saved_criteria", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  criteria: jsonb("criteria").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ *
 * Negotiation (M2). One Mastra thread per listing conversation; the run
 * suspends in Postgres waiting for the user, which is why a serverless
 * function timeout cannot kill a negotiation.
 * ------------------------------------------------------------------ */

export const negotiations = pgTable(
  "negotiations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),

    /** Mastra memory thread + suspended workflow run. */
    threadId: text("thread_id").notNull(),
    runId: text("run_id"),
    status: text("status").notNull().default("drafting"),

    /** Enforced in packages/core after the draft exists, never in a prompt. */
    maxPriceCents: integer("max_price_cents").notNull(),
    targetPriceCents: integer("target_price_cents").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("negotiations_user_listing_idx").on(table.userId, table.listingId)],
);

/**
 * Drafts the user approved and the outcome. Seller replies are NOT stored —
 * message contents are personal information and stay in the user's browser.
 */
export const negotiationDrafts = pgTable(
  "negotiation_drafts",
  {
    id: text("id").primaryKey(),
    negotiationId: text("negotiation_id")
      .notNull()
      .references(() => negotiations.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    filledAt: timestamp("filled_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("negotiation_drafts_negotiation_idx").on(table.negotiationId)],
);

/**
 * Parse health. The extension reports failures; `parse-sentinel` reads this to
 * diff a stored payload against the expected schema when the rate alarms.
 * This is how we learn about breakage from telemetry, not from users.
 */
export const parseFailures = pgTable(
  "parse_failures",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    stage: text("stage").notNull(),
    message: text("message").notNull(),
    rawPayload: jsonb("raw_payload"),
    extensionVersion: text("extension_version"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("parse_failures_occurred_idx").on(table.occurredAt)],
);
