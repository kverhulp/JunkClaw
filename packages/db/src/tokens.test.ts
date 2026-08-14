import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CRITERIA } from "@junkclaw/schema";
import type { Database } from "./client";
import { getCriteria, setCriteria } from "./criteria";
import {
  generateToken,
  hashToken,
  issueToken,
  listActiveTokens,
  revokeToken,
  verifyExtensionToken,
} from "./tokens";
import { createTestDatabase, seedUser } from "./testing";

let db: Database;
let close: () => Promise<void>;
let userId: string;

beforeEach(async () => {
  const test = await createTestDatabase();
  db = test.db;
  close = test.close;
  userId = await seedUser(db);
});

afterEach(async () => {
  await close();
});

describe("extension tokens", () => {
  it("issues a token that authenticates", async () => {
    const token = await issueToken(db, userId);
    const owner = await verifyExtensionToken(db, token);
    expect(owner?.userId).toBe(userId);
  });

  it("never stores the token itself", async () => {
    const token = await issueToken(db, userId);
    const rows = await listActiveTokens(db, userId);
    expect(rows).toHaveLength(1);
    // Only the hash is persisted — a leaked database hands over nothing usable.
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("rejects a token that was never issued", async () => {
    expect(await verifyExtensionToken(db, generateToken())).toBeNull();
  });

  it("rejects a malformed token without touching the database", async () => {
    expect(await verifyExtensionToken(db, "not-a-junkclaw-token")).toBeNull();
  });

  // The bug I shipped and caught: revocation that didn't revoke.
  it("stops accepting a revoked token", async () => {
    const token = await issueToken(db, userId);
    const owner = await verifyExtensionToken(db, token);
    expect(owner).not.toBeNull();

    await revokeToken(db, owner!.tokenId);
    expect(await verifyExtensionToken(db, token)).toBeNull();
  });

  it("hides revoked tokens from the listing", async () => {
    const token = await issueToken(db, userId);
    const owner = await verifyExtensionToken(db, token);
    await revokeToken(db, owner!.tokenId);
    expect(await listActiveTokens(db, userId)).toHaveLength(0);
  });

  it("keeps one user's token from authenticating as another", async () => {
    const other = await seedUser(db, "user_2");
    const token = await issueToken(db, other);
    const owner = await verifyExtensionToken(db, token);
    expect(owner?.userId).toBe(other);
    expect(owner?.userId).not.toBe(userId);
  });

  it("hashes deterministically", () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(generateToken()));
  });
});

describe("saved criteria", () => {
  it("returns defaults for a user who has saved nothing", async () => {
    expect(await getCriteria(db, userId)).toEqual(DEFAULT_CRITERIA);
  });

  it("round-trips a saved shape", async () => {
    const criteria = { ...DEFAULT_CRITERIA, budgetMaxCents: 900_000, radiusKm: 50 };
    await setCriteria(db, userId, criteria);
    expect(await getCriteria(db, userId)).toEqual(criteria);
  });

  it("overwrites rather than accumulating rows", async () => {
    await setCriteria(db, userId, { ...DEFAULT_CRITERIA, radiusKm: 50 });
    await setCriteria(db, userId, { ...DEFAULT_CRITERIA, radiusKm: 75 });
    expect((await getCriteria(db, userId)).radiusKm).toBe(75);
  });

  it("keeps criteria scoped per user", async () => {
    const other = await seedUser(db, "user_2");
    await setCriteria(db, userId, { ...DEFAULT_CRITERIA, radiusKm: 50 });
    await setCriteria(db, other, { ...DEFAULT_CRITERIA, radiusKm: 300 });

    expect((await getCriteria(db, userId)).radiusKm).toBe(50);
    expect((await getCriteria(db, other)).radiusKm).toBe(300);
  });

  // A row written by an older version must not silently mis-score every listing.
  it("falls back to defaults when the stored shape is stale", async () => {
    await setCriteria(db, userId, { ...DEFAULT_CRITERIA, radiusKm: 50 });
    await db.execute(
      `UPDATE saved_criteria SET criteria = '{"budgetMaxCents": 100}'::jsonb`,
    );
    expect(await getCriteria(db, userId)).toEqual(DEFAULT_CRITERIA);
  });
});
