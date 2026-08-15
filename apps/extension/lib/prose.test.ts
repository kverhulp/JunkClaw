import { describe, expect, it } from "vitest";
import { parseProse, parseSpans } from "./prose";

/** Verbatim from a live /api/research response for a 2010 BMW 3 Series. */
const RESEARCH = `**1. Typical Used Asking Price in Canada**
Based on Canadian used vehicle listings, the typical asking price for a 2010 BMW 3 Series ranges from approximately **$2,500 CAD to $6,500 CAD**, depending on mileage, condition, and location.

**2. Commonly Reported Problems**
Owners and reviewers frequently report the following issues for the 2010 model year:
* **Cooling system failures:** Electric water pump failures, thermostat issues, and coolant adapter leaks.
* **Oil and gasket leaks:** Valve cover gasket leaks, cracked valve covers, and oil filter housing gasket leaks.
* **Other common complaint areas:** Brake issues, door lock actuator failures, and seat belt/airbag-related faults.`;

describe("parseSpans", () => {
  it("splits bold runs out of a line", () => {
    expect(parseSpans("ranges from **$2,500 CAD** today")).toEqual([
      { text: "ranges from ", bold: false },
      { text: "$2,500 CAD", bold: true },
      { text: " today", bold: false },
    ]);
  });

  it("is non-greedy, so two bold runs stay two", () => {
    expect(parseSpans("**a** and **b**").filter((s) => s.bold).map((s) => s.text)).toEqual([
      "a",
      "b",
    ]);
  });

  it("leaves an unclosed marker as literal text rather than eating the line", () => {
    expect(parseSpans("costs **about 5000")).toEqual([{ text: "costs **about 5000", bold: false }]);
  });

  it("returns a single plain span when there is no markup", () => {
    expect(parseSpans("plain text")).toEqual([{ text: "plain text", bold: false }]);
  });
});

describe("parseProse", () => {
  const blocks = parseProse(RESEARCH);

  /*
   * The `**` markers are consumed by the heading itself, so the inner spans are
   * plain — the element carries the emphasis, not a nested <strong> inside it.
   */
  it("reads a fully-bold line as a heading, not a paragraph", () => {
    expect(blocks[0]).toEqual({
      kind: "heading",
      spans: [{ text: "1. Typical Used Asking Price in Canada", bold: false }],
    });
  });

  it("keeps the prose paragraph, with its inline bold intact", () => {
    const paragraph = blocks[1];
    expect(paragraph?.kind).toBe("paragraph");
    expect(paragraph?.kind === "paragraph" && paragraph.spans.some((s) => s.bold)).toBe(true);
  });

  it("groups consecutive bullets into one list", () => {
    const lists = blocks.filter((b) => b.kind === "list");
    expect(lists).toHaveLength(1);
    expect(lists[0]?.kind === "list" && lists[0].items).toHaveLength(3);
  });

  it("gives each bullet its leading bold label", () => {
    const list = blocks.find((b) => b.kind === "list");
    const first = list?.kind === "list" ? list.items[0] : undefined;
    expect(first?.[0]).toEqual({ text: "Cooling system failures:", bold: true });
  });

  /*
   * The failure that started this: the whole thing was rendered as one
   * pre-wrapped string, so users read the asterisks.
   */
  it("leaves no literal asterisks anywhere in the output", () => {
    const text = JSON.stringify(blocks);
    expect(text).not.toContain("**");
  });

  it("starts a new list after a heading rather than merging across sections", () => {
    const parsed = parseProse("* one\n**Heading**\n* two");
    expect(parsed.filter((b) => b.kind === "list")).toHaveLength(2);
  });

  it("treats a blank line as a list terminator", () => {
    const parsed = parseProse("* one\n\n* two");
    expect(parsed.filter((b) => b.kind === "list")).toHaveLength(2);
  });

  it("accepts dashes as bullets too", () => {
    const parsed = parseProse("- one\n- two");
    expect(parsed[0]?.kind === "list" && parsed[0].items).toHaveLength(2);
  });

  it("returns nothing for empty input", () => {
    expect(parseProse("")).toEqual([]);
  });
});
