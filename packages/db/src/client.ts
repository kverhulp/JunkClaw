import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  // Serverless: one connection per invocation, no pooling here — Neon's pooler
  // handles that upstream.
  const client = postgres(connectionString, { prepare: false, max: 1 });
  return drizzle(client, { schema });
}

let cached: Database | undefined;

/** Lazily built so importing the package doesn't require DATABASE_URL to be set. */
export function db(): Database {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  cached = createDatabase(url);
  return cached;
}
