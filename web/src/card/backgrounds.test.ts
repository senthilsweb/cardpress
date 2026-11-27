import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BACKGROUNDS, bgById, categoryOf, CATEGORIES, groupsIn } from "./backgrounds";
import { mulberry32 } from "@/lib/rng";
import { standardPalettes } from "@/lib/profiles";

const seasonal = groupsIn("Seasonal greetings");
const draw = (id: string, W: number, H: number, seed: number, pal = standardPalettes[0]) =>
  renderToStaticMarkup(
    bgById(id).render({ W, H, u: Math.min(W, H) / 100, area: { x: W * 0.46, y: 0, w: W * 0.54, h: H }, mask: "right", pal, rng: mulberry32(seed), uid: "t", photos: [] }) as never
  );

describe("backgrounds", () => {
  it("lists Abstract first and puts the built-ins there", () => {
    expect(CATEGORIES.slice(0, 2)).toEqual(["Abstract", "Seasonal greetings"]);
    for (const id of ["constellation", "mesh", "waves", "plain"]) expect(categoryOf(bgById(id))).toBe("Abstract");
  });

  it("has variations for each occasion", () => {
    expect(seasonal.map((g) => g.group)).toEqual(["Thanksgiving", "Diwali", "New Year", "Chinese New Year"]);
    for (const g of seasonal) expect(g.items.length).toBeGreaterThanOrEqual(3);
  });

  it("uses each id once", () => {
    const ids = BACKGROUNDS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws seasonal art that repeats for a seed, at any size and palette", () => {
    for (const { items } of seasonal)
      for (const b of items)
        for (const [W, H] of [[1200, 627], [1080, 1350], [320, 180]])
          for (const pal of [standardPalettes[0], standardPalettes.find((p) => p.id === "lunar-red")!]) {
            const svg = draw(b.id, W, H, 7, pal);
            expect(svg, b.id).toBe(draw(b.id, W, H, 7, pal));
            expect(svg, b.id).not.toMatch(/NaN|undefined|Infinity/);
            expect(svg.length, b.id).toBeGreaterThan(500);
          }
  });
});

describe("framing art", () => {
  it("is offered for greetings and draws at every size", () => {
    expect(bgById("harvest-frame").frames).toBe(true);
    for (const [W, H] of [[1200, 1200], [1080, 1920], [1200, 627]]) expect(draw("harvest-frame", W, H, 3)).not.toMatch(/NaN|undefined|Infinity/);
  });
});
