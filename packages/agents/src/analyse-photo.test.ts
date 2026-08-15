import { afterEach, describe, expect, it, vi } from "vitest";
import { photoAnalyst } from "./agents/photo-analyst";
import { analysePhoto } from "./analyse-photo";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function stubImage(init: { status?: number; type?: string; bytes?: Uint8Array } = {}) {
  const body = init.bytes ?? JPEG;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(init.status && init.status >= 400 ? null : body, {
          status: init.status ?? 200,
          headers: { "content-type": init.type ?? "image/jpeg" },
        }),
    ),
  );
}

const analysis = { observations: [], summary: "A red hatchback in a field." };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("analysePhoto", () => {
  it("reads an image and returns the analysis", async () => {
    stubImage();
    vi.spyOn(photoAnalyst, "generate").mockResolvedValue({ object: analysis } as never);

    const result = await analysePhoto("https://cdn.example/a.jpg");
    expect(result).toEqual({ ok: true, analysis });
  });

  /*
   * The expected end state of every URL we hold, not an anomaly: these links are
   * signed with roughly a four-day expiry, so most of the corpus is 403 by now.
   */
  it("reports an expired signature as unfetchable rather than throwing", async () => {
    stubImage({ status: 403 });
    const generate = vi.spyOn(photoAnalyst, "generate");

    expect(await analysePhoto("https://cdn.example/dead.jpg")).toEqual({
      ok: false,
      reason: "unfetchable",
    });
    // No point paying for a model call on bytes we never got.
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuses anything that is not an image", async () => {
    stubImage({ type: "text/html" });
    expect(await analysePhoto("https://cdn.example/login.html")).toEqual({
      ok: false,
      reason: "not_an_image",
    });
  });

  it("refuses an image too large to be a listing photo", async () => {
    stubImage({ bytes: new Uint8Array(9 * 1024 * 1024) });
    expect(await analysePhoto("https://cdn.example/huge.jpg")).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("survives a transient model failure by retrying once", async () => {
    stubImage();
    const generate = vi
      .spyOn(photoAnalyst, "generate")
      .mockRejectedValueOnce(new Error("upstream hiccup"))
      .mockResolvedValueOnce({ object: analysis } as never);

    expect(await analysePhoto("https://cdn.example/a.jpg")).toEqual({ ok: true, analysis });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry rather than looping", async () => {
    stubImage();
    const generate = vi.spyOn(photoAnalyst, "generate").mockRejectedValue(new Error("down"));

    expect(await analysePhoto("https://cdn.example/a.jpg")).toEqual({
      ok: false,
      reason: "model_failed",
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("treats a missing object as a failure, not as an empty result", async () => {
    stubImage();
    vi.spyOn(photoAnalyst, "generate").mockResolvedValue({ object: undefined } as never);

    // An empty observation list means "nothing remarkable"; no object at all
    // means we never got an answer. Those must not read the same.
    expect(await analysePhoto("https://cdn.example/a.jpg")).toEqual({
      ok: false,
      reason: "model_failed",
    });
  });
});
