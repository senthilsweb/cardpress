import { describe, expect, it } from "vitest";
import { leftOut, mediaOf, whyNot, type PostMedia } from "./media";
import type { Draft } from "./draft";

const m = (kind: PostMedia["kind"], count = 1, largest = 1000): PostMedia => ({ kind, count, largest });
const names = (x: PostMedia) => leftOut(x).map((l) => l.net);

describe("what each network takes", () => {
  it("takes the card, one small picture and a small video everywhere", () => {
    for (const x of [m("card", 0, 0), m("image"), m("video"), m("images", 4)]) expect(names(x)).toEqual([]);
  });
  it("keeps a PDF for LinkedIn only", () => {
    expect(names(m("document"))).toEqual(["X", "Instagram", "Facebook"]);
  });
  it("limits X to four pictures", () => {
    expect(names(m("images", 5))).toEqual(["X"]);
    expect(whyNot("X", m("images", 5))).toBe("4 images at most");
  });
  it("applies each network's file sizes", () => {
    expect(names(m("image", 1, 6 << 20))).toEqual(["X"]);
    expect(names(m("image", 1, 9 << 20))).toEqual(["X", "Instagram"]);
    expect(names(m("video", 1, 301 * (1 << 20)))).toEqual(["Instagram"]);
  });
  it("reads a draft", () => {
    const d = { kind: "post", attachment: "images", images: [{ id: "a", size: 5 }, { id: "b", size: 9 }] } as unknown as Draft;
    expect(mediaOf(d)).toEqual(m("images", 2, 9));
    expect(mediaOf({ ...d, kind: "article" }).kind).toBe("card");
    expect(mediaOf(null).kind).toBe("card");
  });
});
