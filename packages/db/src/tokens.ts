import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "./client";
import { extensionTokens } from "./schema";

/**
 * Extension credentials.
 *
 * The token is shown to the user once, at issue time, and only its SHA-256 is
 * stored — a leaked database should not hand anyone a working credential.
 */

const TOKEN_PREFIX = "jc_";

export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface TokenOwner {
  userId: string;
  tokenId: string;
}

/**
 * Resolves a bearer token to its owner, or null.
 *
 * The lookup is by hash, so it's a single indexed equality — but the final
 * comparison is still constant-time. An indexed lookup already leaks little,
 * and the cost of doing this properly is one function call.
 */
export async function verifyExtensionToken(
  db: Database,
  token: string,
): Promise<TokenOwner | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const candidateHash = hashToken(token);
  const rows = await db
    .select({
      id: extensionTokens.id,
      userId: extensionTokens.userId,
      tokenHash: extensionTokens.tokenHash,
    })
    .from(extensionTokens)
    // The revoked check belongs in the query, not in a caller's discipline —
    // a revoked token must stop working on the next request, everywhere.
    .where(and(eq(extensionTokens.tokenHash, candidateHash), isNull(extensionTokens.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (!constantTimeEquals(row.tokenHash, candidateHash)) return null;

  return { userId: row.userId, tokenId: row.id };
}

/** Recorded out of band so a failed touch never fails the request itself. */
export async function touchToken(db: Database, tokenId: string): Promise<void> {
  await db
    .update(extensionTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(extensionTokens.id, tokenId));
}

export async function issueToken(
  db: Database,
  userId: string,
  label = "Extension",
): Promise<string> {
  const token = generateToken();
  await db.insert(extensionTokens).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: hashToken(token),
    label,
  });
  return token;
}

export async function revokeToken(db: Database, tokenId: string): Promise<void> {
  await db
    .update(extensionTokens)
    .set({ revokedAt: new Date() })
    .where(eq(extensionTokens.id, tokenId));
}

/** Active tokens only — a revoked one must stop working immediately. */
export async function listActiveTokens(db: Database, userId: string) {
  return db
    .select({
      id: extensionTokens.id,
      label: extensionTokens.label,
      createdAt: extensionTokens.createdAt,
      lastUsedAt: extensionTokens.lastUsedAt,
    })
    .from(extensionTokens)
    .where(and(eq(extensionTokens.userId, userId), isNull(extensionTokens.revokedAt)));
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
