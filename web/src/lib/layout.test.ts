import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, parseLayout } from "./layout";

describe("parseLayout", () => {
  it("falls back to the default for anything that is not an object", () => {
    for (const v of [undefined, null, "x", 5]) expect(parseLayout(v)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout([])).toEqual(DEFAULT_LAYOUT); // an array has no usable fields
  });
  it("reads a saved layout", () => {
    expect(parseLayout({ sidebarCollapsed: true, collapsed: { Hashtags: true, Image: false }, editorHeight: 400.4 })).toEqual({
      sidebarCollapsed: true, collapsed: { Hashtags: true }, editorHeight: 400,
    });
  });
  it("ignores wrong types and absurd heights", () => {
    expect(parseLayout({ sidebarCollapsed: "yes", collapsed: { a: "true", b: true }, editorHeight: 99999 })).toEqual({
      sidebarCollapsed: false, collapsed: { b: true }, editorHeight: undefined,
    });
    expect(parseLayout({ editorHeight: 10 }).editorHeight).toBeUndefined();
  });
});
