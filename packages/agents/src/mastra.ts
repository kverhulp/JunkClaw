import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { PostgresStore } from "@mastra/pg";
import { agents } from "./agents/index";
import { workflows } from "./workflows/index";

/**
 * The Mastra instance.
 *
 * It lives here — in a package that imports nothing from Next — so that hosting
 * it inside the web app is a deployment choice rather than an architectural one.
 * When a negotiation needs to outlive a serverless invocation, promoting this to
 * a standalone Mastra server should be a day of rewiring, not a rewrite.
 *
 * Storage is the same Postgres as the corpus: Mastra's memory threads (one per
 * listing conversation) and suspended workflow state sit alongside the listings
 * they're about.
 */
export function createMastra(connectionString: string) {
  return new Mastra({
    agents,
    workflows,
    // `id` is required by @mastra/pg and names this store instance in Mastra's
    // own bookkeeping — omitting it fails at first use, not at construction.
    // Same database as the corpus, but Mastra's own bookkeeping gets its own
    // schema — `public` in this project belongs to an earlier spike and our
    // tables live in `junkclaw`.
    storage: new PostgresStore({
      id: "junkclaw",
      connectionString,
      schemaName: "junkclaw_mastra",
    }),
    logger: new PinoLogger({ name: "junkclaw", level: "info" }),
  });
}

export type JunkclawMastra = ReturnType<typeof createMastra>;

let cached: JunkclawMastra | undefined;

/** Lazy so importing the package doesn't require DATABASE_URL at module load. */
export function mastra(): JunkclawMastra {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  cached = createMastra(url);
  return cached;
}
