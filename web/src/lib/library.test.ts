import { describe, expect, it } from "vitest";
import { pageNumbers } from "./library";

describe("pageNumbers", () => {
  it("shows every page when there are few", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
  });
  it("keeps the ends and the neighbours, and marks the gaps", () => {
    expect(pageNumbers(1, 9)).toEqual([1, 2, "…", 9]);
    expect(pageNumbers(5, 9)).toEqual([1, "…", 4, 5, 6, "…", 9]);
    expect(pageNumbers(9, 9)).toEqual([1, "…", 8, 9]);
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

import { pagePath } from "./library";
describe("pagePath", () => {
  it("is the public address of a live page, by kind", () => {
    expect(pagePath({ kind: "article", slug: "a-fine-title", pageAt: "2026-11-24T10:00:00Z" })).toBe("/articles/a-fine-title");
    expect(pagePath({ kind: "post", slug: "hello", pageAt: "2026-11-24T10:00:00Z" })).toBe("/posts/hello");
  });
  it("is nothing when the page is not live or has no address", () => {
    expect(pagePath({ kind: "article", slug: "x", pageAt: "" })).toBeNull();
    expect(pagePath({ kind: "article", slug: "", pageAt: "2026-11-24T10:00:00Z" })).toBeNull();
    expect(pagePath({ kind: "post" })).toBeNull();
  });
  it("escapes an address", () => {
    expect(pagePath({ kind: "post", slug: "a b", pageAt: "x" })).toBe("/posts/a%20b");
  });
});
