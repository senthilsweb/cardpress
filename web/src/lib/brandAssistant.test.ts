import { describe, expect, it } from "vitest";
import { amountCents, amountText, assistantProblem, type BrandAssistant } from "./brandAssistant";

const ok: BrandAssistant = { tier: "standard", checks: true, rounds: 3, monthCents: 0, alertPercent: 80 };

describe("a brand's assistant settings", () => {
  it("reads an amount as cents", () => {
    expect(amountCents("")).toBe(0);
    expect(amountCents(" 25 ")).toBe(2500);
    expect(amountCents("25.5")).toBe(2550);
    expect(amountCents("0.29")).toBe(29);
    expect(amountCents("25.505")).toBeNaN();
    expect(amountCents("-1")).toBeNaN();
    expect(amountCents("ten")).toBeNaN();
  });
  it("writes cents as an amount", () => {
    expect(amountText(0)).toBe("");
    expect(amountText(2500)).toBe("25");
    expect(amountText(2550)).toBe("25.50");
  });
  it("says what cannot be saved", () => {
    expect(assistantProblem(ok)).toBeNull();
    expect(assistantProblem({ ...ok, rounds: 6 })).toMatch(/Rounds/);
    expect(assistantProblem({ ...ok, monthCents: Number.NaN })).toMatch(/budget/);
    expect(assistantProblem({ ...ok, monthCents: 100001 })).toMatch(/budget/);
    expect(assistantProblem({ ...ok, alertPercent: 40 })).toMatch(/Alert/);
  });
});
