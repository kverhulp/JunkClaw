/**
 * Turns the research agent's markdown into something the panel can lay out.
 *
 * The model writes markdown because that is what models write, and the panel was
 * setting it as `textContent` — so users read literal asterisks:
 *
 *   **1. Typical Used Asking Price in Canada**
 *   * **Cooling system failures:** Electric water pump failures...
 *
 * Parsing to a structure rather than to HTML is deliberate. This text comes from
 * a model, which makes it untrusted input; building elements from the parsed
 * spans means there is no path from model output to `innerHTML`, so a listing
 * description that happens to contain markup cannot become markup. It also keeps
 * the parser pure, so it is testable without a DOM.
 *
 * A deliberately small subset — bold, bullets, and a heading line — because that
 * is the whole of what the agent emits. Anything unrecognised stays as plain
 * text rather than being silently dropped.
 */

export interface ProseSpan {
  text: string;
  bold: boolean;
}

export type ProseBlock =
  | { kind: "heading"; spans: ProseSpan[] }
  | { kind: "paragraph"; spans: ProseSpan[] }
  | { kind: "list"; items: ProseSpan[][] };

/** A line that is nothing but bold text is the agent's section heading. */
const HEADING = /^\*\*(.+)\*\*$/;
const BULLET = /^[*-]\s+(.+)$/;

export function parseProse(text: string): ProseBlock[] {
  const blocks: ProseBlock[] = [];
  let bullets: ProseSpan[][] = [];

  const flushBullets = (): void => {
    if (bullets.length > 0) {
      blocks.push({ kind: "list", items: bullets });
      bullets = [];
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) {
      flushBullets();
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      bullets.push(parseSpans(bullet[1]!));
      continue;
    }

    // A heading ends whatever list preceded it.
    flushBullets();

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", spans: parseSpans(heading[1]!) });
      continue;
    }

    blocks.push({ kind: "paragraph", spans: parseSpans(line) });
  }

  flushBullets();
  return blocks;
}

/**
 * Splits a line into bold and plain runs.
 *
 * Non-greedy, so `**a** and **b**` yields two bold runs rather than one that
 * swallows the middle. An unclosed `**` is left as literal text — the agent
 * having written malformed markdown is not a reason to eat the sentence.
 */
export function parseSpans(line: string): ProseSpan[] {
  const spans: ProseSpan[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let cursor = 0;

  for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
    if (match.index > cursor) {
      spans.push({ text: line.slice(cursor, match.index), bold: false });
    }
    spans.push({ text: match[1]!, bold: true });
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) spans.push({ text: line.slice(cursor), bold: false });
  return spans;
}
