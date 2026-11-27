import { describe, expect, it } from "vitest";
import { formatInZone, relative, toLocalInput, zonedToUtc, zoneOtherName } from "./jobs";

const iso = (s: string, tz: string) => zonedToUtc(s, tz)?.toISOString();

describe("zonedToUtc", () => {
  it("handles zones with and without daylight saving", () => {
    expect(iso("2026-12-01T09:00", "UTC")).toBe("2026-12-01T09:00:00.000Z");
    expect(iso("2026-12-01T09:00", "Europe/London")).toBe("2026-12-01T09:00:00.000Z"); // winter: GMT
    expect(iso("2026-07-01T09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z"); // summer: BST
    expect(iso("2026-12-01T09:00", "America/New_York")).toBe("2026-12-01T14:00:00.000Z");
    expect(iso("2026-07-01T09:00", "America/New_York")).toBe("2026-07-01T13:00:00.000Z");
    expect(iso("2026-12-01T09:00", "Asia/Kolkata")).toBe("2026-12-01T03:30:00.000Z"); // +5:30
    expect(iso("2026-12-01T09:00", "Australia/Sydney")).toBe("2026-11-30T22:00:00.000Z"); // the day before in UTC
  });
  it("gets times just after a daylight-saving change right", () => {
    expect(iso("2026-03-08T03:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z"); // 2am→3am that day, now EDT
    expect(iso("2026-03-08T01:30", "America/New_York")).toBe("2026-03-08T06:30:00.000Z"); // still EST
    expect(iso("2026-11-01T03:30", "America/New_York")).toBe("2026-11-01T08:30:00.000Z"); // after falling back, EST
  });
  it("returns null for junk", () => {
    expect(zonedToUtc("not a date", "UTC")).toBeNull();
    expect(zonedToUtc("", "UTC")).toBeNull();
    expect(zonedToUtc("2026-12-01T09:00", "Mars/Olympus")).toBeNull();
  });
});

describe("toLocalInput and formatInZone", () => {
  it("round-trips through a zone", () => {
    for (const tz of ["UTC", "Europe/London", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland"]) {
      const d = new Date("2026-06-15T12:34:00Z");
      expect(zonedToUtc(toLocalInput(d, tz), tz)?.toISOString()).toBe(d.toISOString());
    }
  });
  it("writes the wall clock time of the zone", () => {
    expect(toLocalInput(new Date("2026-12-01T14:00:00Z"), "America/New_York")).toBe("2026-12-01T09:00");
  });
  it("formats in the zone with its abbreviation", () => {
    expect(formatInZone("2026-12-01T14:00:00Z", "UTC")).toMatch(/UTC/);
    expect(formatInZone("2026-12-01T14:00:00Z", "UTC")).toMatch(/2026/);
    expect(() => formatInZone("2026-12-01T14:00:00Z", "Nowhere/Land")).not.toThrow();
  });
});

describe("relative", () => {
  const now = Date.parse("2026-12-01T09:00:00Z");
  it("says how far away a time is", () => {
    expect(relative("2026-12-01T09:00:20Z", now)).toBe("in less than a minute");
    expect(relative("2026-12-01T09:45:00Z", now)).toBe("in 45 min");
    expect(relative("2026-12-01T12:00:00Z", now)).toBe("in 3 h");
    expect(relative("2026-12-04T09:00:00Z", now)).toBe("in 3 days");
    expect(relative("2026-12-01T08:55:00Z", now)).toBe("5 min ago");
  });
});

describe("zone names", () => {
  it("answers to the city's other name", () => {
    expect(zoneOtherName("Asia/Calcutta")).toBe("Kolkata");
    expect(zoneOtherName("Asia/Kolkata")).toBe("Calcutta");
    expect(zoneOtherName("Europe/Paris")).toBe("");
  });
});
