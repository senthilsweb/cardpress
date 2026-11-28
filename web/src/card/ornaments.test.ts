import { describe, expect, it } from "vitest";
import { groupsIn } from "./backgrounds";
import { ORNAMENTS, ornamentOf, ornamentsFor } from "./ornaments";

describe("ornaments", () => {
  it("picks up the starter set, each once, with the heart first", () => {
    expect(ORNAMENTS.map((o) => o.id)).toEqual(["heart", "divider", "leaf", "diya", "sparkles", "blossom"]);
  });

  it("leaves older cards as they were", () => {
    expect(ornamentOf({})).toBe("heart");
    expect(ornamentOf({ noOrnament: true })).toBe("none");
    expect(ornamentOf({ noOrnament: false })).toBe("heart");
  });

  it("takes a picked ornament over the old switch, and the heart for one it does not have", () => {
    expect(ornamentOf({ ornament: "diya", noOrnament: true })).toBe("diya");
    expect(ornamentOf({ ornament: "none" })).toBe("none");
    expect(ornamentOf({ ornament: "gone" })).toBe("heart");
  });

  it("lists the occasion's ornaments first and keeps the rest", () => {
    expect(ornamentsFor("Diwali").slice(0, 2).map((o) => o.id)).toEqual(["diya", "sparkles"]);
    expect(ornamentsFor("Diwali")).toHaveLength(ORNAMENTS.length);
    expect(ornamentsFor()).toEqual(ORNAMENTS);
  });

  it("suggests only occasions that have backgrounds", () => {
    const known = new Set(groupsIn("Seasonal greetings").map((g) => g.group));
    for (const o of ORNAMENTS) for (const occasion of o.occasions ?? []) expect(known.has(occasion), `${o.id}: ${occasion}`).toBe(true);
  });
});
