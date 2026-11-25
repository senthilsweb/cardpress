import { describe, expect, it } from "vitest";
import { draftName, searchDrafts } from "./draftSearch";
import type { Draft } from "./draft";

const d = (id: string, kind: "post" | "article", title: string, text: string, updatedAt: string, hashtags: string[] = []) =>
  ({ id, kind, title, hashtags, updatedAt, unicodeStyles: false, altText: "", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } }) as unknown as Draft;

const all = [
  d("a", "article", "Data contracts in practice", "How teams agree on tables.", "2026-01-01"),
  d("b", "post", "", "We wrote about data contracts last week.", "2026-03-01", ["Governance"]),
  d("c", "article", "Cooking for ten", "Nothing about tables of data here? A little.", "2026-02-01"),
];
const ids = (r: Draft[]) => r.map((x) => x.id).join("");

describe("searchDrafts", () => {
  it("lists everything newest first when nothing is typed", () => expect(ids(searchDrafts(all, "  "))).toBe("bca"));
  it("needs every word, in any order and any case", () => {
    expect(ids(searchDrafts(all, "CONTRACTS data"))).toBe("ba"); // an untitled post is named by its first line
    expect(ids(searchDrafts(all, "contracts cooking"))).toBe("");
  });
  it("puts a match in the name before a newer mention in the text", () => expect(ids(searchDrafts(all, "data"))).toBe("bac"));
  it("finds hashtags, and keeps to one kind when asked", () => {
    expect(ids(searchDrafts(all, "#governance"))).toBe("b");
    expect(ids(searchDrafts(all, "data", "article"))).toBe("ac");
    expect(ids(searchDrafts(all, "tables"))).toBe("ca");
  });
});

describe("draftName", () => {
  it("is the title, else the first line", () => {
    expect(draftName(all[0])).toBe("Data contracts in practice");
    expect(draftName(all[1])).toBe("We wrote about data contracts last week.");
  });
});
