import { describe, expect, it } from "vitest";
import { fitScale } from "./fit";

describe("fitting a block of words", () => {
  it("leaves one that fits alone", () => {
    expect([fitScale(400, 300), fitScale(400, 400), fitScale(0, 100), fitScale(400, 0)]).toEqual([1, 1, 1, 1]);
  });

  it("makes a taller one small enough, never a hair too large", () => {
    expect(fitScale(300, 400)).toBe(0.75);
    expect(fitScale(383, 405) * 405).toBeLessThanOrEqual(383);
  });
});
