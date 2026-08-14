import type { NextRequest } from "next/server";

/**
 * Auth boundary for the API routes.
 *
 * The extension holds a bearer token issued by the web app's "connect extension"
 * page. No Facebook OAuth anywhere: it gives us `public_profile` and `email` and
 * nothing we need, and requires a Meta app review we would not pass.
 *
 * TODO(M1): wire better-auth (magic link + Google) with the Drizzle adapter over
 * @junkclaw/db's user/session/account/verification tables, and issue extension
 * tokens from it. The shape below is what the routes consume, so swapping the
 * implementation in doesn't touch them.
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
  throw new Error("requireUser: not implemented — M1, needs better-auth wiring");
}
