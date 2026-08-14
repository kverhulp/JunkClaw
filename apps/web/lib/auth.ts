import type { NextRequest } from "next/server";
import { db, touchToken, verifyExtensionToken } from "@junkclaw/db";

/**
 * Auth boundary for the API routes.
 *
 * M0 authenticates the extension with a bearer token the user pastes into the
 * options page, bound to a `user` row. This is not a smaller auth model than
 * M1's — the schema is multi-user either way — it is one credential type, and
 * better-auth's magic link and Google sign-in add the others on top.
 *
 * No Facebook OAuth anywhere: it grants `public_profile` and `email` and
 * nothing we need, and requires a Meta app review we would not pass.
 */

export interface AuthedUser {
  id: string;
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(request: NextRequest): Promise<AuthedUser> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }

  const token = header.slice("Bearer ".length).trim();
  const owner = await verifyExtensionToken(db(), token);
  if (!owner) throw new UnauthorizedError("Invalid or revoked token");

  // Recorded out of band: a failed bookkeeping write must not fail ingest.
  void touchToken(db(), owner.tokenId).catch(() => {});

  return { id: owner.userId };
}
