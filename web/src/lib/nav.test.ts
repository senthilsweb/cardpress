import { describe, expect, it } from "vitest";
import { LEGACY_OPEN, sectionFromPath, settingsHref, visibleSections } from "./nav";

describe("settings sections", () => {
  it("reads the section from the address", () => {
    expect(sectionFromPath("/settings/api-keys/")).toBe("api-keys");
    expect(sectionFromPath("/base/settings/users")).toBe("users");
    expect(sectionFromPath("/settings/")).toBeUndefined();
    expect(sectionFromPath("/settings/nope/")).toBeUndefined();
  });

  it("shows a person only the pages they may open", () => {
    const editor = visibleSections(true, (p) => p !== "users").map((s) => s.id);
    expect(editor).toEqual(["account", "brands", "social", "api-keys"]);
    const admin = visibleSections(true, () => true).map((s) => s.id);
    expect(admin).toEqual(["account", "brands", "social", "api-keys", "users", "assistant"]);
    // without accounts there is no person: no account, keys or users pages
    expect(visibleSections(false, (p) => p !== "users").map((s) => s.id)).toEqual(["brands", "social"]);
  });

  it("sends the old drawer addresses to their pages", () => {
    expect(LEGACY_OPEN.accounts).toBe("social");
    expect(settingsHref("brands", "?new=1")).toMatch(/settings\/brands\/\?new=1$/);
  });
});
