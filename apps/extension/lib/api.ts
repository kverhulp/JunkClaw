import { z } from "zod";
import type { ListingDetail } from "./detail";
import {
  IngestResponseSchema,
  ScoreResponseSchema,
  DraftMessageSchema,
  VehicleResearchSchema,
  type IngestRequest,
  type IngestResponse,
  type ScoreRequest,
  type ScoreResponse,
  type VehicleResearch,
} from "@junkclaw/schema";

/**
 * A draft, or the reason there isn't one.
 *
 * `reason` is not an error channel: the usual cause is the ceiling refusing a
 * draft that named too high a number, and the user needs to read that rather
 * than see a failure.
 */
const DraftResponseSchema = z.object({
  draft: DraftMessageSchema.nullable(),
  reason: z.string().nullable(),
});
export type DraftResponse = z.infer<typeof DraftResponseSchema>;

/**
 * The extension's only door to our server.
 *
 * Everything crossing it is typed by the shared contract, which is what makes
 * "we never send seller PII" a compile-time property rather than a promise: the
 * ingest DTO has nowhere to put a name, a profile link, a photo, or a message.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiConfig {
  baseUrl: string;
  token: string;
}

export async function postIngest(
  config: ApiConfig,
  body: IngestRequest,
): Promise<IngestResponse> {
  return request(config, "/api/ingest", body, IngestResponseSchema);
}

export async function postScore(
  config: ApiConfig,
  body: ScoreRequest,
): Promise<ScoreResponse> {
  return request(config, "/api/score", body, ScoreResponseSchema);
}

/**
 * Researches one model-year. User-initiated: a cache hit is free but a miss
 * spends a grounded model call, so this is never fired for a whole grid.
 */
export async function postResearch(
  config: ApiConfig,
  vehicle: { year: number; make: string; model: string },
): Promise<VehicleResearch> {
  /*
   * Rebuilt field by field rather than forwarded, because the caller holds a
   * whole `Vehicle` and TypeScript will not stop it being passed here — excess
   * property checks apply to object literals, not to variables. It sent all
   * nine fields, `/api/research` is a strictObject, and every click came back
   * `400 Unrecognized keys: trim, mileageKm, transmission, drivetrain, fuel,
   * vin`.
   *
   * Widening the server schema would have been the wrong repair. It is strict
   * on purpose — a `Vehicle` can carry a VIN, and the request that asks what a
   * model-year is worth has no business sending one.
   */
  const body = { year: vehicle.year, make: vehicle.make, model: vehicle.model };
  return request(config, "/api/research", body, VehicleResearchSchema);
}

/**
 * Sends what a detail page added. Fire and forget from the worker's side: the
 * listing already exists with its grid facts, and a failed enrichment leaves it
 * exactly as it was.
 */
export async function postEnrich(
  config: ApiConfig,
  detail: ListingDetail,
): Promise<{ enriched: boolean }> {
  return request(config, "/api/enrich", detail, EnrichResponseSchema);
}

const EnrichResponseSchema = z.strictObject({ enriched: z.boolean() });

async function request<T>(
  config: ApiConfig,
  path: string,
  body: unknown,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ApiError(`${path} failed: ${response.status}`, response.status);
  }

  return schema.parse(await response.json());
}

/**
 * Drafts the opening message for one listing.
 *
 * Drafting only — the panel shows the text and the user copies it themselves.
 * Nothing is sent by the extension, and the button says so.
 */
export async function postDraft(
  config: ApiConfig,
  body: { externalId: string; maxPriceCents: number | null },
): Promise<DraftResponse> {
  return request(config, "/api/draft", body, DraftResponseSchema);
}
