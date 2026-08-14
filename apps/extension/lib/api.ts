import {
  IngestResponseSchema,
  ScoreResponseSchema,
  type IngestRequest,
  type IngestResponse,
  type ScoreRequest,
  type ScoreResponse,
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
