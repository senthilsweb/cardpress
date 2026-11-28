import { describe, expect, it } from "vitest";
import { findSections, LEGACY_OPEN, SETTINGS_SECTIONS, sectionFromPath, settingsHref, settingsPlace, visibleSections } from "./nav";

describe("settings sections", () => {
  it("reads the section from the address", () => {
    expect(sectionFromPath("/settings/api-keys/")).toBe("api-keys");
    expect(sectionFromPath("/base/settings/users")).toBe("users");
    expect(sectionFromPath("/settings/")).toBeUndefined();
    expect(sectionFromPath("/settings/nope/")).toBeUndefined();
  });

  it("shows a person only the pages they may open", () => {
    const editor = visibleSections(true, (p) => p !== "users").map((s) => s.id);
    expect(editor).toEqual(["account", "appearance", "api-keys", "brands", "look", "social", "guides"]);
    const admin = visibleSections(true, () => true).map((s) => s.id);
    expect(admin).toEqual(["account", "appearance", "api-keys", "brands", "look", "social", "brand-assistant", "guides", "users", "security", "assistant"]);
    // without accounts there is no person: no account, keys or users pages
    expect(visibleSections(false, (p) => p !== "users").map((s) => s.id)).toEqual(["appearance", "brands", "look", "social", "guides"]);
  });

  it("sends the old drawer addresses to their pages", () => {
    expect(LEGACY_OPEN.accounts).toBe("social");
    expect(settingsHref("brands", "?new=1")).toMatch(/settings\/brands\/\?new=1$/);
  });
});

describe("settings in a dialog", () => {
  it("finds pages by name and by what is on them", () => {
    const ids = (q: string) => findSections(SETTINGS_SECTIONS, q).map((s) => s.id);
    expect(ids("password")).toEqual(["account", "users", "security"]);
    expect(ids("LinkedIn")).toEqual(["social"]);
    expect(ids("brand logo")).toEqual(["look"]);
    expect(ids("zzz")).toEqual([]);
    expect(ids("")).toHaveLength(SETTINGS_SECTIONS.length);
  });

  it("tells a settings address from any other", () => {
    expect(settingsPlace("/settings/social/")?.section).toBe("social");
    expect(settingsPlace("/settings/")).not.toBeNull();
    expect(settingsPlace("/settings/")?.section).toBeUndefined();
    expect(settingsPlace("/studio/")).toBeNull();
    expect(settingsPlace("/help/")).toBeNull();
  });

  it("reads the older address of a brand's look", () => {
    expect(settingsPlace("/settings/brands/", "?look=acme")?.section).toBe("look");
    expect(settingsPlace("/settings/brands/", "?new=1")?.section).toBe("brands");
  });
});
