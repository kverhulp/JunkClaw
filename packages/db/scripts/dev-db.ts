/**
 * A real Postgres for local development, with nothing to install.
 *
 * PGlite speaks the actual Postgres wire protocol over a TCP socket, so
 * `postgres-js` — and therefore the Next app, the migrations, and the ingest
 * path — connect to it exactly as they would to Neon. No Docker, no brew, no
 * service to remember to stop.
 *
 *   pnpm dev:db        # then DATABASE_URL=postgres://localhost:5432/postgres
 *
 * Data persists in packages/db/.pgdata so a restart doesn't lose the corpus.
 * This is for development only; production is Neon.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", ".pgdata");
const port = Number(process.env.DEV_DB_PORT ?? 5432);

const db = await PGlite.create({ dataDir });
// Default is ONE connection, which resets the moment a second client dials in —
// and we have at least two: Drizzle's postgres-js client and Mastra's own pool.
// The symptom is a bare ECONNRESET from the API, nothing in the db log.
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });

await server.start();
console.log(`postgres listening on 127.0.0.1:${port}`);
console.log(`data dir: ${dataDir}`);
console.log(`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${port}/postgres`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
