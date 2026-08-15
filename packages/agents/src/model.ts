/**
 * The single place a model provider is named.
 *
 * Mastra routes across providers with a `provider/model` string, so switching
 * provider is an env change here rather than an edit across eight agent files.
 * The build plan is explicit that we don't hardcode a provider and that the
 * real choice gets made on evals against our own listings once we have ~100
 * labelled examples — `eval-judge` exists for exactly that.
 */

/** Deep reasoning: negotiation, comp widening, ambiguous dedup calls. */
export const REASONING_MODEL = process.env.JUNKCLAW_MODEL ?? "anthropic/claude-opus-5";

/**
 * High-volume structured extraction. Every new listing you scroll past hits
 * this, so it is the one place cost scales with browsing.
 */
export const EXTRACTION_MODEL =
  process.env.JUNKCLAW_EXTRACTION_MODEL ?? "anthropic/claude-opus-5";

/** Offline grading. Never in the hot path, so correctness beats cost here. */
export const EVAL_MODEL = process.env.JUNKCLAW_EVAL_MODEL ?? "anthropic/claude-opus-5";

/**
 * Web research. Must be a model whose provider executes search server-side —
 * `google_search` grounding is a Gemini capability, not a portable one, so this
 * is the one model id that is not freely swappable.
 */
export const RESEARCH_MODEL = process.env.JUNKCLAW_RESEARCH_MODEL ?? "google/gemini-flash-latest";

/**
 * Vision. Reads the listing photo we already hold, which is the one rich signal
 * that costs no Marketplace request — the image lives on a CDN and needs no
 * session, unlike every route to the description.
 *
 * Separate from EXTRACTION_MODEL because the constraint is different: this one
 * must actually accept images, so it is not freely swappable for any text model
 * the gateway happens to route.
 */
export const VISION_MODEL = process.env.JUNKCLAW_VISION_MODEL ?? "google/gemini-flash-latest";
