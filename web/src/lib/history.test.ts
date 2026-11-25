import { describe, expect, it } from "vitest";
import { costText, groupByAge } from "./history";

const at = (d: Date) => ({ updatedAt: d.toISOString() });

describe("groupByAge", () => {
  const now = new Date(2026, 10, 25, 15, 0);
  const today = at(new Date(2026, 10, 25, 0, 1)), yesterday = at(new Date(2026, 10, 24, 23, 59)), sixDays = at(new Date(2026, 10, 19, 1, 0)), old = at(new Date(2026, 10, 18, 23, 0));
  it("splits at local midnight and keeps the order", () => {
    expect(groupByAge([today, yesterday, sixDays, old], now)).toEqual([
      { name: "Today", items: [today] }, { name: "Last 7 days", items: [yesterday, sixDays] }, { name: "Earlier", items: [old] },
    ]);
  });
  it("leaves out empty groups", () => expect(groupByAge([old], now).map((g) => g.name)).toEqual(["Earlier"]));
});

describe("costText", () => {
  it("reads as money", () => {
    expect(costText(0)).toBe("under $0.01");
    expect(costText(8)).toBe("$0.08");
    expect(costText(144)).toBe("$1.44");
  });
});
