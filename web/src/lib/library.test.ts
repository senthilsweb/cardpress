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
