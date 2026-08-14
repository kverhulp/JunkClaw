import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Database } from "./client";
import { user } from "./schema";

/**
 * A real Postgres, in-process.
 *
 * PGlite runs actual Postgres compiled to WASM, so these tests exercise the same
 * SQL the production database will — `ON CONFLICT`, `BETWEEN`, foreign keys,
 * timestamp handling — rather than a mock's idea of it. No Docker, no service,
 * no DATABASE_URL, which means the persistence layer is verified on every CI run
 * instead of waiting on infrastructure someone has to provision.
 *
 * Migrations are applied from the same `migrations/` directory that ships to
 * production, so a migration that doesn't apply cleanly fails here first.
 */

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "migrations");

export interface TestDatabase {
  db: Database;
  close: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

  return {
    // The drivers differ (postgres-js in production, PGlite here) but the query
    // surface these modules use is identical. The cast is confined to tests.
    db: db as unknown as Database,
    close: () => client.close(),
  };
}

/** Most things are scoped by user, so most tests need one. */
export async function seedUser(db: Database, id = "user_1"): Promise<string> {
  await db.insert(user).values({
    id,
    name: "Test User",
    email: `${id}@example.test`,
    emailVerified: true,
  });
  return id;
}
