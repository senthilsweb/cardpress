import { describe, expect, it } from "vitest";
import { findBackgrounds } from "./search";
import { standardPalettes } from "@/lib/profiles";

const ids = (...a: Parameters<typeof findBackgrounds>) => findBackgrounds(...a).flatMap((s) => s.items.map((b) => b.id));

describe("background search", () => {
  it("shows everything, a category or one occasion", () => {
    expect(ids("").length).toBeGreaterThan(20);
    expect(ids("", { category: "Abstract" })).toContain("mesh");
    expect(ids("", { category: "Seasonal greetings", group: "Diwali" })).toEqual(["diwali-diyas", "diwali-rangoli", "diwali-garlands"]);
  });

  it("finds an occasion by its names and wishes, whatever is selected", () => {
    for (const q of ["thanks", "Thanksgiving", "gratitude"]) expect(ids(q, { category: "Abstract" })).toContain("maple-weave");
    expect(ids("deepavali")).toContain("diwali-diyas");
    expect(ids("lunar")).toContain("lunar-lanterns");
    expect(ids("diwali lamps")).toContain("diwali-diyas");
    expect(ids("zzzz")).toEqual([]);
  });

  it("suggests only colours that exist", () => {
    const known = new Set(standardPalettes.map((p) => p.id));
    for (const s of findBackgrounds("", { category: "Seasonal greetings" })) for (const b of s.items) expect(known.has(b.palette!), b.id).toBe(true);
  });
});
