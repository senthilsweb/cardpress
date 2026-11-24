import { describe, expect, it } from "vitest";
import { blankDesign, brandColor, brandProblem, buildBrand, initials, move, newBrandId, pickActive } from "./brands";
import { DEFAULT_DESIGN, DEFAULT_PROFILES, upgradePlaceholderText } from "./profiles";

describe("newBrandId", () => {
  it("makes a readable id and never reuses one", () => {
    const first = newBrandId("TemplrPress", [], () => 0.5);
    expect(first).toMatch(/^templrpress-[0-9a-z]{4}$/);
    const next = newBrandId("TemplrPress", [first], (() => { const v = [0.5, 0.25]; return () => v.shift() ?? 0.9; })());
    expect(next).not.toBe(first);
  });
  it("copes with names that have no letters", () => {
    expect(newBrandId("日本", [], () => 0.1)).toMatch(/^brand-/);
  });
});

describe("buildBrand", () => {
  it("starts blank from the default look with the identity cleared", () => {
    const b = buildBrand({ name: "  Acme  ", handle: " @acme " }, []);
    expect(b.name).toBe("Acme");
    expect(b.displayName).toBe("Acme");
    expect(b.handle).toBe("@acme");
    expect(b.logoText).toBe("ACME");
    expect(b.website).toBe("");
    expect(b.palettes.length).toBe(DEFAULT_PROFILES[0].palettes.length);
    expect(b.id).not.toBe(DEFAULT_PROFILES[0].id);
  });
  it("copies identity, colours and fonts, with its own id, name and handle", () => {
    const from = { ...DEFAULT_PROFILES[0], id: "src", name: "Source", logoImage: "data:image/png;base64,AA", displayFont: "Lexend" as const, palettes: [{ ...DEFAULT_PROFILES[0].palettes[0], id: "mine", name: "Mine" }] };
    const b = buildBrand({ name: "Copy", handle: "", from }, ["src"]);
    expect(b.id).not.toBe("src");
    expect(b.name).toBe("Copy");
    expect(b.handle).toBe(from.handle);
    expect(b.logoImage).toBe(from.logoImage);
    expect(b.displayFont).toBe("Lexend");
    expect(b.palettes).toEqual(from.palettes);
    b.palettes[0].name = "changed";
    expect(from.palettes[0].name).toBe("Mine"); // a real copy, not shared
  });
});

describe("blankDesign", () => {
  it("has neutral text and no footer, and keeps the look", () => {
    const d = blankDesign({ ...DEFAULT_DESIGN, footer: "x", footerLeft: "y" });
    expect(d.footer).toBe("");
    expect(d.footerLeft).toBe("");
    expect(d.title).not.toBe(DEFAULT_DESIGN.title);
    expect(d.layout).toBe(DEFAULT_DESIGN.layout);
    expect(d.paletteId).toBe(DEFAULT_DESIGN.paletteId);
  });
  it("is not mistaken for the old placeholder, which is replaced by the sample text when loaded", () => {
    const d = blankDesign(DEFAULT_DESIGN);
    expect(upgradePlaceholderText(d)).toBe(d);
  });
});

describe("pickActive", () => {
  const list = [{ id: "a" }, { id: "b" }];
  it("opens the remembered brand while it is active, otherwise the first", () => {
    expect(pickActive("b", list)).toBe("b");
    expect(pickActive("gone", list)).toBe("a");
    expect(pickActive(undefined, list)).toBe("a");
    expect(pickActive(42, list)).toBe("a");
    expect(pickActive("a", [])).toBeUndefined();
  });
});

describe("move", () => {
  it("moves one place and stops at the ends", () => {
    expect(move(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(move(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(move(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(move(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(move(["a", "b"], "zzz", 1)).toEqual(["a", "b"]);
  });
});

describe("initials and colours", () => {
  it("makes short badges", () => {
    expect(initials("Senthil Karuppaiah")).toBe("SK");
    expect(initials("templrpress")).toBe("TE");
    expect(initials("  ")).toBe("?");
  });
  it("takes the accent of the colour set the card uses", () => {
    const p = DEFAULT_PROFILES[0];
    const pal = p.palettes[3];
    expect(brandColor(p, { ...DEFAULT_DESIGN, paletteId: pal.id })).toBe(pal.accent);
    expect(brandColor(p, { ...DEFAULT_DESIGN, paletteId: "nope" })).toBe(p.palettes[0].accent);
  });
});

describe("brandProblem", () => {
  it("asks for a name, and refuses duplicates and very long names", () => {
    expect(brandProblem("", [])).toMatch(/name/);
    expect(brandProblem("  ", [])).toMatch(/name/);
    expect(brandProblem("Acme", [{ name: "acme" }])).toMatch(/already/);
    expect(brandProblem("x".repeat(61), [])).toMatch(/60/);
    expect(brandProblem("Acme", [{ name: "Other" }])).toBeUndefined();
  });
});
