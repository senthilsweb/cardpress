import { describe, expect, it } from "vitest";
import { duration, money, shortDay, statusRows } from "./dashboard";

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
