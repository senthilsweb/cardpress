import { describe, expect, it } from "vitest";
import { DEFAULT_DESIGN, SAMPLE_TEXT, upgradePlaceholderText } from "./profiles";
import type { Design } from "./types";

const oldDefault: Design = {
  ...DEFAULT_DESIGN,
  eyebrow: "Data & AI · Open source",
  title: "Your headline goes here",
  subtitle: "Short supporting line | second point | third point",
  footer: "", footerLeft: undefined, tag: "Part 1", statValue: "10x",
  layout: "quote", background: "dots", paletteId: "ink",
};

describe("sample card", () => {
  it("starts from the sample text", () => {
    expect(DEFAULT_DESIGN.title).toBe("Many Questions.\nOne SQL Row.");
    expect(DEFAULT_DESIGN.footer).toBe(SAMPLE_TEXT.footer);
    expect(DEFAULT_DESIGN.footerLeft).toBe(SAMPLE_TEXT.footerLeft);
  });
  it("replaces untouched placeholder text but keeps the user's layout, colours and background", () => {
    const up = upgradePlaceholderText(oldDefault);
    expect(up.title).toBe(SAMPLE_TEXT.title);
    expect(up.footer).toBe(SAMPLE_TEXT.footer);
    expect([up.layout, up.background, up.paletteId]).toEqual(["quote", "dots", "ink"]);
  });
  it("leaves a card alone once any placeholder text has been edited", () => {
    for (const field of ["title", "eyebrow", "subtitle"] as const) {
      const mine = { ...oldDefault, [field]: "my own words" };
      expect(upgradePlaceholderText(mine)).toBe(mine);
    }
  });
});
