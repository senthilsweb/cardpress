import { describe, expect, it } from "vitest";
import { PAGES } from "../../guide/content.mjs";
import { helpPlace, linkTarget, pageHtml } from "./help";

describe("the guide in the app", () => {
  it("has the contents of every page, with its pictures found", () => {
    for (const [slug] of PAGES) {
      expect(pageHtml(slug).length, slug).toBeGreaterThan(100);
      expect(pageHtml(slug), slug).not.toContain('src="img/');
    }
  });

  it("opens the page an address names, or the first", () => {
    expect(helpPlace("?page=social", "#x")).toEqual({ page: "social", anchor: "x" });
    for (const bad of ["", "?page=nope", "?page=toString"]) expect(helpPlace(bad, "")).toEqual({ page: "start", anchor: "" });
  });

  it("keeps links between pages inside the app and leaves others alone", () => {
    expect(linkTarget("brands.html", "start")).toEqual({ page: "brands", anchor: "" });
    expect(linkTarget("#renew", "social")).toEqual({ page: "social", anchor: "renew" });
    for (const out of ["https://example.com/a.html", "nope.html", "", undefined]) expect(linkTarget(out, "start")).toBeNull();
  });
});
