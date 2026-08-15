import { PhotoAnalysisSchema, photoAnalyst, type PhotoAnalysis } from "./agents/photo-analyst";

/**
 * Fetches a listing photo and reads it.
 *
 * The bytes are fetched here and passed inline rather than handing the model a
 * URL. Two reasons, and the second is the one that bites:
 *
 * 1. A provider fetching on our behalf is a request we cannot see, from an
 *    address we do not control, to a host that rate-limits.
 * 2. These URLs expire. They are signed — `oh` is a hash and `oe` a hex expiry,
 *    measured at roughly four days on the ones we hold. A link that worked at
 *    ingest is a 403 by the weekend, so the analysis has to happen while the
 *    signature is live and the *result* is what gets stored. Storing the URL and
 *    analysing later is the version that silently stops working.
 */

/** Beyond this the image is not a listing photo and we should not be paying for it. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** A dead signature should fail fast, not hold a request open. */
const FETCH_TIMEOUT_MS = 10_000;

export type PhotoAnalysisResult =
  | { ok: true; analysis: PhotoAnalysis }
  | { ok: false; reason: "unfetchable" | "too_large" | "not_an_image" | "model_failed" };

export async function analysePhoto(url: string): Promise<PhotoAnalysisResult> {
  let bytes: Uint8Array;
  let mediaType: string;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    // 403 here is the expected end state of every URL we hold, not an anomaly.
    if (!response.ok) return { ok: false, reason: "unfetchable" };

    mediaType = response.headers.get("content-type") ?? "";
    if (!mediaType.startsWith("image/")) return { ok: false, reason: "not_an_image" };

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) return { ok: false, reason: "too_large" };
    bytes = new Uint8Array(buffer);
  } catch {
    return { ok: false, reason: "unfetchable" };
  }

  /*
   * One retry, because the failure we actually saw was transient — a clear
   * photo of a Toyota Tacoma that failed once and read fine on a second pass.
   *
   * Normally a transient failure just means "try later", and `photoAnalysedAt`
   * is deliberately left unstamped so it does. But later is not free here: the
   * URL signature expires in about four days, and a listing whose only two
   * chances both land in one bad minute cannot be analysed at all afterwards.
   * A single immediate retry costs one call and buys back most of that risk.
   */
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await photoAnalyst.generate(
        [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Report only what is visible in this listing photograph.",
              },
              { type: "image", image: bytes, mediaType },
            ],
          },
        ],
        { structuredOutput: { schema: PhotoAnalysisSchema } },
      );

      const analysis = result.object;
      if (analysis) return { ok: true, analysis };
    } catch {
      // Fall through to the retry, then out.
    }
  }

  // Left unrecorded rather than stamped, so a later run tries again — while the
  // signature is still alive, which is a short window.
  return { ok: false, reason: "model_failed" };
}
