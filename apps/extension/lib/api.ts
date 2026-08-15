import {
  IngestResponseSchema,
  ScoreResponseSchema,
  VehicleResearchSchema,
  type IngestRequest,
  type IngestResponse,
  type ScoreRequest,
  type ScoreResponse,
  type VehicleResearch,
} from "@junkclaw/schema";

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
  body: { year: number; make: string; model: string },
): Promise<VehicleResearch> {
  return request(config, "/api/research", body, VehicleResearchSchema);
}

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
