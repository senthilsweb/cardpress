import { describe, expect, it } from "vitest";
import { countries, detailsProblem, EMPTY_DETAILS, sameDetails } from "./brandDetails";

describe("brand details", () => {
  it("lists every country once, by name", () => {
    const list = countries();
    expect(list).toHaveLength(249);
    expect(new Set(list.map((c) => c.code)).size).toBe(249);
    expect(list.find((c) => c.code === "IN")?.name).toBe("India");
    expect(list.find((c) => c.code === "US")?.name).toBe("United States");
  });

  it("accepts nothing filled in, and says what is wrong with an email or a number", () => {
    expect(detailsProblem(EMPTY_DETAILS)).toBeUndefined();
    expect(detailsProblem({ ...EMPTY_DETAILS, email: "owner@acme.example", mobile: "+91 98400 00000" })).toBeUndefined();
    expect(detailsProblem({ ...EMPTY_DETAILS, email: "owner@acme" })).toMatch(/email/);
    expect(detailsProblem({ ...EMPTY_DETAILS, mobile: "call me" })).toMatch(/mobile/);
  });

  it("tells whether anything changed", () => {
    expect(sameDetails(EMPTY_DETAILS, { ...EMPTY_DETAILS })).toBe(true);
    expect(sameDetails(EMPTY_DETAILS, { ...EMPTY_DETAILS, city: "Chennai" })).toBe(false);
  });
});
