import { eq } from "drizzle-orm";
import { DEFAULT_CRITERIA, SavedCriteriaSchema, type SavedCriteria } from "@junkclaw/schema";
import type { Database } from "./client";
import { savedCriteria } from "./schema";

/**
 * Saved criteria, one row per user.
 *
 * Stored as validated JSON rather than columns: the shape belongs to
 * @junkclaw/schema and changes with the product, and a migration per new filter
 * would be friction with no benefit at this size.
 */

export async function getCriteria(db: Database, userId: string): Promise<SavedCriteria> {
  const rows = await db
    .select({ criteria: savedCriteria.criteria })
    .from(savedCriteria)
    .where(eq(savedCriteria.userId, userId))
    .limit(1);

  const stored = rows[0]?.criteria;
  if (!stored) return DEFAULT_CRITERIA;

  // A row written by an older version is replaced by defaults rather than
  // half-trusted — a criteria object missing a field it now needs would score
  // every listing wrongly and silently.
  const parsed = SavedCriteriaSchema.safeParse(stored);
  return parsed.success ? parsed.data : DEFAULT_CRITERIA;
}

export async function setCriteria(
  db: Database,
  userId: string,
  criteria: SavedCriteria,
): Promise<void> {
  await db
    .insert(savedCriteria)
    .values({ id: crypto.randomUUID(), userId, criteria, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: savedCriteria.userId,
      set: { criteria, updatedAt: new Date() },
    });
}
