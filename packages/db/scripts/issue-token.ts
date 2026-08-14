/**
 * Issues an extension token from the command line.
 *
 *   pnpm --filter @junkclaw/db token:issue you@example.com
 *
 * Why a script and not a page: issuing a token from the web app requires being
 * signed in, sign-in is better-auth (M1), and the page that would host it
 * belongs to the dashboard owner. That is a three-way dependency standing
 * between us and the first row in the corpus — and M0's gate question can't be
 * answered until listings are flowing.
 *
 * This is the M0 path, not the M1 one. The web flow replaces it; the underlying
 * `issueToken` is the same function either way, so nothing here is throwaway.
 */
import { createDatabase } from "../src/client";
import { issueToken } from "../src/tokens";
import { user } from "../src/schema";
import { eq } from "drizzle-orm";

const email = process.argv[2];
const label = process.argv[3] ?? "Extension (CLI)";

if (!email) {
  console.error("usage: token:issue <email> [label]");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const db = createDatabase(url);

const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);

let userId = existing[0]?.id;
if (!userId) {
  userId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId,
    name: email.split("@")[0] ?? "User",
    email,
    emailVerified: true,
  });
  console.log(`Created user ${email}`);
}

const token = await issueToken(db, userId, label);

console.log("");
console.log("  Paste this into the extension's options page:");
console.log("");
console.log(`    ${token}`);
console.log("");
console.log("  It is not stored anywhere in readable form — only its SHA-256.");
console.log("  Losing it means issuing a new one, which is fine.");
console.log("");

process.exit(0);
