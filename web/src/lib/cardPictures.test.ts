import { describe, expect, it } from "vitest";
import { backgroundFor, drawsPicture } from "./cardPictures";
import { DEFAULT_DESIGN } from "./profiles";
import type { Design } from "./types";

const card = (patch: Partial<Design> = {}): Design => ({ ...DEFAULT_DESIGN, background: "dots", layout: "hero", photos: [], screenshot: undefined, bgImage: undefined, ...patch });

describe("an added picture is seen", () => {
  it("brings the background that draws it", () => {
    expect(backgroundFor(card(), { bgImage: "a" }, false)).toBe("image");
    expect(backgroundFor(card(), { screenshot: "a" }, false)).toBe("browser");
    expect(backgroundFor(card(), { photos: ["a"] }, false)).toBe("mosaic");
    expect(backgroundFor(card({ background: "image", bgImage: "a" }), { screenshot: "b" }, false)).toBe("browser");
  });

  it("changes nothing when the card already draws it", () => {
    expect(backgroundFor(card({ background: "image", bgImage: "a" }), { bgImage: "b" }, false)).toBeUndefined();
    expect(backgroundFor(card({ background: "mosaic", photos: ["a"] }), { photos: ["a", "b"] }, false)).toBeUndefined();
  });

  it("changes nothing when a picture is only removed or reordered", () => {
    expect(backgroundFor(card({ bgImage: "a" }), { bgImage: undefined }, false)).toBeUndefined();
    expect(backgroundFor(card({ photos: ["a", "b"] }), { photos: ["b"] }, false)).toBeUndefined();
    expect(backgroundFor(card({ screenshot: "a" }), { screenshot: "a" }, false)).toBeUndefined();
  });

  it("leaves the background of a Split card whose headshot the photo is", () => {
    expect(backgroundFor(card({ layout: "split" }), { photos: ["a"] }, false)).toBeUndefined();
    expect(backgroundFor(card({ layout: "split" }), { photos: ["a"] }, true)).toBe("mosaic");
    expect(drawsPicture(card({ layout: "split" }), "photos", false)).toBe(true);
    expect(drawsPicture(card(), "photos", false)).toBe(false);
  });
});
