import { describe, expect, it } from "vitest";
import { daysIn, initialsOf, joinDate, roleLabel, splitDate } from "./session";

describe("dates for the drop-downs", () => {
  it("splits and joins a date", () => {
    expect(splitDate("1990-12-05")).toEqual({ y: "1990", m: "12", d: "5" });
    expect(joinDate("1990", "12", "5")).toBe("1990-12-05");
    expect(joinDate("1990", "2", "")).toBe("");
    expect(splitDate("")).toEqual({ y: "", m: "", d: "" });
  });
  it("knows how many days a month has", () => {
    expect(daysIn("2024", "2")).toBe(29);
    expect(daysIn("2023", "2")).toBe(28);
    expect(daysIn("2023", "4")).toBe(30);
    expect(daysIn("", "")).toBe(31);
  });
});

describe("names", () => {
  it("makes initials and role labels", () => {
    expect(initialsOf({ firstName: "ada", lastName: "Lovelace" })).toBe("AL");
    expect(initialsOf(undefined)).toBe("?");
    expect(roleLabel({ roles: ["editor"] })).toBe("Editor");
    expect(roleLabel({ roles: ["admin", "writer"] })).toBe("Admin, Writer");
  });
});
