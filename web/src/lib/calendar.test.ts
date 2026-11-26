import { describe, expect, it } from "vitest";
import { byDay, dayKey, entryHref, entryState, parseDayKey, startOfWeek, step, viewDays, viewRange, type CalendarEntry } from "./calendar";

const entry = (p: Partial<CalendarEntry>): CalendarEntry => ({ type: "job", id: "j", profileId: "p", kind: "post", status: "scheduled", title: "T", at: "2026-11-26T10:00:00Z", ...p });

describe("calendar days", () => {
  it("starts weeks on Monday", () => {
    expect(dayKey(startOfWeek(new Date(2026, 10, 26)))).toBe("2026-11-23"); // a Thursday
    expect(dayKey(startOfWeek(new Date(2026, 10, 29)))).toBe("2026-11-23"); // a Sunday
  });

  it("shows six weeks for a month, seven days for a week and one for a day", () => {
    const month = viewDays("month", new Date(2026, 10, 15));
    expect(month).toHaveLength(42);
    expect(dayKey(month[0])).toBe("2026-10-26"); // the Monday before 1 November
    expect(viewDays("week", new Date(2026, 10, 26)).map(dayKey)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"]);
    expect(viewDays("day", new Date(2026, 10, 26, 15)).map(dayKey)).toEqual(["2026-11-26"]);
  });

  it("asks the server for the whole span, no more than 45 days", () => {
    const r = viewRange("month", new Date(2026, 10, 15));
    const days = (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000;
    expect(Math.round(days)).toBe(42);
  });

  it("moves by a month, a week or a day", () => {
    expect(dayKey(step("month", new Date(2026, 0, 31), 1))).toBe("2026-02-01");
    expect(dayKey(step("week", new Date(2026, 10, 26), -1))).toBe("2026-11-19");
    expect(dayKey(step("day", new Date(2026, 11, 31), 1))).toBe("2027-01-01");
  });

  it("reads a day from the address", () => {
    expect(dayKey(parseDayKey("2026-11-26")!)).toBe("2026-11-26");
    expect(parseDayKey("26/11/2026")).toBeNull();
  });
});

describe("calendar entries", () => {
  it("groups by day in time order", () => {
    const late = entry({ id: "b", at: new Date(2026, 10, 26, 18).toISOString() });
    const early = entry({ id: "a", at: new Date(2026, 10, 26, 8).toISOString() });
    expect(byDay([late, early]).get("2026-11-26")!.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("marks sent, waiting, problems and plans", () => {
    expect(entryState(entry({ status: "published" }))).toBe("sent");
    expect(entryState(entry({ status: "scheduled" }))).toBe("waiting");
    expect(entryState(entry({ status: "missed" }))).toBe("problem");
    expect(entryState(entry({ type: "plan", status: "approved" }))).toBe("planned");
  });

  it("opens an entry's page in the library", () => {
    expect(entryHref("/", entry({ id: "j1" }))).toBe("/library/?item=job:j1");
    expect(entryHref("/", entry({ type: "plan", id: "d1" }))).toBe("/library/?item=draft:d1");
  });
});
