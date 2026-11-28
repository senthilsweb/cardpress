import { describe, expect, it } from "vitest";
import { fillsCard, shadeLayers, type ShadePlace } from "./shade";

const at = (patch: Partial<ShadePlace> = {}): ShadePlace => ({ layout: "hero", land: false, textTop: 0.6, logo: true, footer: true, ...patch });

describe("shading one's own picture", () => {
  it("leaves the picture untouched at 0", () => {
    expect(shadeLayers("#000000", 0, at())).toEqual([]);
  });

  it("sits where the words are", () => {
    expect(shadeLayers("#000000", 1, at())[0]).toContain("rgba(0,0,0,0) 38%");
    expect(shadeLayers("#000000", 1, at({ land: true }))[0]).toMatch(/^linear-gradient\(90deg/);
    for (const layout of ["center", "quote", "greeting"] as const) expect(shadeLayers("#000000", 1, at({ layout }))[0]).toMatch(/^radial-gradient/);
  });

  it("covers the logo and the footer only when they are shown", () => {
    expect(shadeLayers("#000000", 1, at({ land: true }))).toHaveLength(3);
    expect(shadeLayers("#000000", 1, at({ land: true, logo: false, footer: false }))).toHaveLength(1);
    expect(shadeLayers("#000000", 1, at())).toHaveLength(2);
  });

  it("applies only to a picture that fills the card", () => {
    expect([fillsCard({ background: "image", bgImage: "a" }), fillsCard({ background: "image" }), fillsCard({ background: "dots", bgImage: "a" })]).toEqual([true, false, false]);
  });
});
