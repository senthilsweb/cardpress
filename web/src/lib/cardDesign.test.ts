import { describe, expect, it } from "vitest";
import { fullDesign, toCardDesign, withFooterFlags } from "./cardDesign";
import { DEFAULT_DESIGN } from "./profiles";

describe("card words", () => {
  it("never fills an item's missing words from the sample card", () => {
    const d = fullDesign(DEFAULT_DESIGN, { background: "dots" });
    expect([d.footerLeft, d.footer, d.title, d.background, d.sizeId]).toEqual(["", "", "", "dots", DEFAULT_DESIGN.sizeId]);
  });

  it("keeps an emptied footer empty through a save", () => {
    const cleared = { ...DEFAULT_DESIGN, ...withFooterFlags({ footerLeft: "" }) };
    const saved = toCardDesign(cleared);
    expect([saved.footerLeft, saved.noFooterLeft]).toEqual(["", true]);
    expect(fullDesign(DEFAULT_DESIGN, saved).noFooterLeft).toBe(true);
  });

  it("saves a picked ornament in place of the old switch", () => {
    const saved = toCardDesign({ ...DEFAULT_DESIGN, noOrnament: true, ornament: "diya" });
    expect([saved.ornament, saved.noOrnament]).toEqual(["diya", undefined]);
    expect(toCardDesign({ ...DEFAULT_DESIGN, noOrnament: true }).noOrnament).toBe(true);
    expect(fullDesign(DEFAULT_DESIGN, { background: "dots" }).ornament).toBeUndefined();
  });

  it("keeps a shade of 0 through a save", () => {
    expect(toCardDesign({ ...DEFAULT_DESIGN, shade: 0 }).shade).toBe(0);
    expect("shade" in toCardDesign(DEFAULT_DESIGN)).toBe(false);
  });

  it("clears the flag when text is written or the brand's is asked for", () => {
    expect(withFooterFlags({ footer: "x" }).noFooter).toBe(false);
    expect(withFooterFlags({ footer: "", noFooter: false }).noFooter).toBe(false);
    expect("noFooter" in withFooterFlags({ title: "x" })).toBe(false);
  });
});
