import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILES, completeProfiles, withStandardPalettes } from "./profiles";
import type { Profile } from "./types";

describe("withStandardPalettes", () => {
  it("falls back to the default profile when nothing is saved", () => {
    expect(withStandardPalettes([])).toBe(DEFAULT_PROFILES);
  });

  it("keeps the saved profile's own fields and adds the standard colour sets", () => {
    const [pr] = withStandardPalettes([{ ...DEFAULT_PROFILES[0], id: "mine", name: "Mine", palettes: [] }]);
    expect(pr.id).toBe("mine");
    expect(pr.name).toBe("Mine");
    expect(pr.palettes.length).toBeGreaterThan(20);
  });

  it("copes with a profile saved without colour sets or fonts, as the API can leave it", () => {
    const bare = { id: "api", name: "From the API" } as unknown as Profile;
    const [pr] = withStandardPalettes([bare]);
    expect(pr.id).toBe("api");
    expect(pr.name).toBe("From the API");
    expect(pr.palettes.length).toBeGreaterThan(20);
    expect(pr.displayFont).toBeTruthy();
  });
});

describe("completeProfiles", () => {
  it("keeps an empty list empty, so there is no phantom brand in the archive", () => {
    expect(completeProfiles([])).toEqual([]);
  });
  it("completes every profile in a list", () => {
    const out = completeProfiles([{ id: "a", name: "A" }, { id: "b", name: "B" }] as never);
    expect(out.map((p) => p.id)).toEqual(["a", "b"]);
    expect(out.every((p) => p.palettes.length > 20)).toBe(true);
  });
});
