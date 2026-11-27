import { describe, expect, it } from "vitest";
import { duration, money, periodLabel, periodQuery, rangeProblem, readPeriod, shortDay, statusRows, writePeriod } from "./dashboard";

const none = { total: 0, draft: 0, approved: 0, scheduled: 0, published: 0, attention: 0, pages: 0 };

describe("dashboard writing", () => {
  it("writes money to the cent", () => {
    expect(money(0)).toBe("$0.00");
    expect(money(7)).toBe("$0.07");
    expect(money(123456)).toBe("$1,234.56");
  });

  it("writes working time", () => {
    expect(duration(45.4)).toBe("45 s");
    expect(duration(120)).toBe("2 min");
    expect(duration(200)).toBe("3 min 20 s");
    expect(duration(7500)).toBe("2 h 5 min");
    expect(duration(7199)).toBe("2 h");
  });

  it("writes a day as that day", () => {
    expect(shortDay("2026-11-01")).toBe("1 Nov");
  });

  it("lists a post's trouble only when there is some", () => {
    expect(statusRows("post", none).map((r) => r.label)).toEqual(["Draft", "Approved", "Scheduled", "Published"]);
    expect(statusRows("post", { ...none, attention: 2 }).at(-1)).toEqual({ label: "Needs a look", count: 2 });
    expect(statusRows("article", { ...none, pages: 1 }).at(-1)).toEqual({ label: "Public page", count: 1 });
  });
});

describe("dashboard period", () => {
  const range = { from: "2026-10-01", to: "2026-10-15" };

  it("asks the server for days or for a range", () => {
    expect(periodQuery({ days: 0 })).toEqual({ days: "0" });
    expect(periodQuery(range)).toEqual(range);
  });

  it("says what is wrong with a range", () => {
    expect(rangeProblem("2026-10-01", "2026-10-01")).toBe("");
    expect(rangeProblem("", "2026-10-01")).toBe("Choose both days.");
    expect(rangeProblem("2026-02-30", "2026-03-01")).toBe("Choose both days.");
    expect(rangeProblem("2026-10-02", "2026-10-01")).toBe("The first day is after the last.");
    expect(rangeProblem("2020-01-01", "2026-01-01")).toBe("Choose at most five years.");
  });

  it("remembers the choice, and falls back to 30 days", () => {
    for (const p of [{ days: 7 }, { days: 0 }, range]) expect(readPeriod(writePeriod(p))).toEqual(p);
    for (const bad of [null, "", "12", "2026-10-02..2026-10-01", "x..y"]) expect(readPeriod(bad)).toEqual({ days: 30 });
  });

  it("names the period", () => {
    expect(periodLabel({ days: 7 })).toBe("last 7 days");
    expect(periodLabel({ days: 0 })).toBe("all time");
    expect(periodLabel(range)).toBe("1 Oct – 15 Oct 2026");
    expect(periodLabel({ from: "2025-12-30", to: "2026-01-02" })).toBe("30 Dec 2025 – 2 Jan 2026");
    expect(periodLabel({ from: "2026-10-01", to: "2026-10-01" })).toBe("1 Oct 2026");
  });
});
