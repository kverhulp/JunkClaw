import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { UnauthorizedError } from "./auth";

/**
 * Every route parses its body through the shared Zod contract before doing
 * anything else. A payload carrying seller PII fails here with a 400 — the
 * boundary is enforced at the edge, not trusted to callers.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 }),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Payload rejected", issues: parsed.error.issues },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Unimplemented steps answer 501 rather than pretending to succeed. A skeleton
 * that returns a plausible-looking empty result is worse than one that says so.
 */
export function notImplemented(what: string, milestone: string): NextResponse {
  return NextResponse.json(
    { error: `${what} is not implemented yet`, milestone },
    { status: 501 },
  );
}

export function handleError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status: 500 });
}
