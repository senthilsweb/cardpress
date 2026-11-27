import { describe, expect, it } from "vitest";
import { findOptions } from "./options";

const list = ["Åland Islands", "America/New York", "India", "British Indian Ocean Territory", "Côte d’Ivoire"].map((label) => ({ value: label, label }));
const find = (q: string) => findOptions(list, q).map((o) => o.label);

describe("searching a drop-down", () => {
  it("lists everything until something is typed", () => expect(find("  ")).toHaveLength(5));
  it("ignores accents, case and the marks of a time zone", () => {
    expect(find("aland")).toEqual(["Åland Islands"]);
    expect(find("cote")).toEqual(["Côte d’Ivoire"]);
    expect(find("new_york")).toEqual(["America/New York"]);
    expect(find("america york")).toEqual(["America/New York"]);
  });
  it("puts what starts with it first", () => expect(find("ind")).toEqual(["India", "British Indian Ocean Territory"]));
  it("finds by another name too", () => expect(findOptions([{ value: "Asia/Calcutta", label: "Asia/Calcutta", words: "Kolkata" }], "kolkata")).toHaveLength(1));
  it("may find nothing", () => expect(find("zz")).toEqual([]));
});
