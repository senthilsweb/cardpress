import { describe, expect, it } from "vitest";
import { countWords, filterCommands, outlineOf, parseSizeIndex, parseWidth, readingMinutes, slashQuery, stepSize, type Walkable } from "./editorTools";

describe("slash menu", () => {
  it("shows every command for a bare slash", () => { expect(filterCommands("")).toHaveLength(9); });
  it("filters by the start of a word in the name", () => {
    expect(filterCommands("sub").map((c) => c.id)).toEqual(["h2"]);
    expect(filterCommands("list").map((c) => c.id)).toEqual(["bullets", "numbers"]);
  });
  it("finds a command by a keyword, after name matches", () => {
    expect(filterCommands("image").map((c) => c.id)).toEqual(["picture"]);
    expect(filterCommands("code").map((c) => c.id)).toEqual(["codeBlock"]);
  });
  it("returns nothing for text that matches nothing", () => { expect(filterCommands("zzz")).toEqual([]); });
  it("opens only when the paragraph is just a slash and a short word", () => {
    expect(slashQuery("/")).toBe("");
    expect(slashQuery("/hea")).toBe("hea");
    expect(slashQuery("text /")).toBeNull();
    expect(slashQuery("/a/b")).toBeNull();
    expect(slashQuery("")).toBeNull();
  });
});

const node = (name: string, text = "", level?: number) => ({ type: { name }, attrs: level ? { level } : {}, textContent: text });
const fake = (nodes: [ReturnType<typeof node>, number][]): Walkable => ({
  descendants: (f) => { for (const [n, p] of nodes) f(n, p); },
});

describe("outline", () => {
  it("lists H1 to H3 with positions, skipping other nodes and empty headings", () => {
    const doc = fake([[node("paragraph", "intro"), 0], [node("heading", "One", 1), 7], [node("heading", "  ", 2), 12], [node("heading", "Two", 2), 14], [node("heading", "Deep", 3), 30], [node("heading", "Too deep", 4), 40]]);
    expect(outlineOf(doc)).toEqual([{ level: 1, text: "One", pos: 7 }, { level: 2, text: "Two", pos: 14 }, { level: 3, text: "Deep", pos: 30 }]);
  });
  it("is empty without headings", () => { expect(outlineOf(fake([[node("paragraph", "x"), 0]]))).toEqual([]); });
});

describe("counts", () => {
  it("counts words, not spaces or symbols", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  one two\nthree — four!  ")).toBe(4);
    expect(countWords("don't stop, well-known 42")).toBe(4);
  });
  it("reads at 200 words a minute, at least a minute", () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(30)).toBe(1);
    expect(readingMinutes(1000)).toBe(5);
  });
});

describe("remembered choices", () => {
  it("steps the size within its range", () => {
    expect(stepSize(0, -1)).toBe(0);
    expect(stepSize(1, 1)).toBe(2);
    expect(stepSize(3, 1)).toBe(3);
  });
  it("falls back on bad saved values", () => {
    expect(parseWidth("wide")).toBe("wide");
    expect(parseWidth("x")).toBe("narrow");
    expect(parseWidth(null)).toBe("narrow");
    expect(parseSizeIndex("2")).toBe(2);
    expect(parseSizeIndex("9")).toBe(1);
    expect(parseSizeIndex("abc")).toBe(1);
    expect(parseSizeIndex(null)).toBe(1);
  });
});
