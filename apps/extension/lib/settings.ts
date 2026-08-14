import { DEFAULT_CRITERIA, SavedCriteriaSchema, type SavedCriteria } from "@junkclaw/schema";

/**
 * Extension-local settings. Criteria live here as well as on the server so the
 * options page works before a round trip and the Fit filter survives being
 * offline.
 */

export const enabled = storage.defineItem<boolean>("local:enabled", {
  fallback: true,
});

export const apiBaseUrl = storage.defineItem<string>("local:apiBaseUrl", {
  fallback: "http://localhost:3000",
});

/** Issued by the web app's "connect extension" page. Never a Facebook token. */
export const apiToken = storage.defineItem<string>("local:apiToken", {
  fallback: "",
});

export const criteria = storage.defineItem<SavedCriteria>("local:criteria", {
  fallback: DEFAULT_CRITERIA,
});

export async function readCriteria(): Promise<SavedCriteria> {
  const stored = await criteria.getValue();
  const parsed = SavedCriteriaSchema.safeParse(stored);
  // A stored shape from an older version is replaced rather than half-trusted.
  return parsed.success ? parsed.data : DEFAULT_CRITERIA;
}
