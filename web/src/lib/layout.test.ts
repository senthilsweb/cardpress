import { describe, expect, it } from "vitest";
import { clampSidebar, DEFAULT_LAYOUT, parseLayout } from "./layout";

describe("parseLayout", () => {
  it("falls back to the default for anything that is not an object", () => {
    for (const v of [undefined, null, "x", 5]) expect(parseLayout(v)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout([])).toEqual(DEFAULT_LAYOUT); // an array has no usable fields
  });
  it("reads a saved layout", () => {
    expect(parseLayout({ sidebarCollapsed: true, collapsed: { Hashtags: true, Image: false }, editorHeight: 400.4 })).toEqual({
      sidebarCollapsed: true, collapsed: { Hashtags: true }, editorHeight: 400, mode: "chat", both: false,
    });
    expect(parseLayout({ mode: "design", both: true })).toMatchObject({ mode: "design", both: true });
    expect(parseLayout({ mode: "edit" }).mode).toBe("details"); // saved before Edit became Details
  });
  it("ignores wrong types and absurd heights", () => {
    expect(parseLayout({ sidebarCollapsed: "yes", collapsed: { a: "true", b: true }, editorHeight: 99999 })).toEqual({
      sidebarCollapsed: false, collapsed: { b: true }, editorHeight: undefined, mode: "chat", both: false,
    });
    expect(parseLayout({ editorHeight: 10 }).editorHeight).toBeUndefined();
  });
  it("keeps the left column within its limits and leaves the canvas room", () => {
    expect(parseLayout({ sidebarWidth: 500 }).sidebarWidth).toBe(500);
    expect(parseLayout({ sidebarWidth: 5000 }).sidebarWidth).toBe(720);
    expect(parseLayout({ sidebarWidth: "wide" }).sidebarWidth).toBeUndefined();
    expect(clampSidebar(100)).toBe(320);
    expect(clampSidebar(700, 1024)).toBe(544);
    expect(clampSidebar(700, 600)).toBe(320);
  });
});
