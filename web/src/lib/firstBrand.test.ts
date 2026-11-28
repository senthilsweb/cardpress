import { describe, expect, it } from "vitest";
import { firstBrand } from "./firstBrand";
import { completeProfiles, DEFAULT_DESIGN, DEFAULT_PROFILES } from "./profiles";

describe("a person's first brand", () => {
  it("is named after them, with an id of its own", () => {
    const b = firstBrand({ fullName: "  Ada   Lovelace " }, () => 0.5);
    expect(b).toMatchObject({ name: "Ada Lovelace", displayName: "Ada Lovelace", logoText: "ADA LOVELACE", handle: "", website: "" });
    expect(b.id).toMatch(/^ada-lovelace-[0-9a-z]{4}$/);
    expect(firstBrand().name).toBe("My brand");
  });

  it("carries nobody else's details, and neither does the starting card", () => {
    const text = JSON.stringify([firstBrand({ fullName: "Ada Lovelace" }), { ...DEFAULT_PROFILES[0], palettes: [] }, DEFAULT_DESIGN]);
    expect(text.toLowerCase()).not.toContain("senthil");
  });

  it("fills what a saved brand lacks from its own name", () => {
    const [b] = completeProfiles([{ id: "x", name: "Acme" } as never]);
    expect(b).toMatchObject({ displayName: "Acme", logoText: "ACME", handle: "", website: "" });
  });
});
