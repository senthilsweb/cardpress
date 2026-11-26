import { describe, expect, it } from "vitest";
import schema from "./content/content.schema.json";
import { BY_ACTION, GROUPS, appliesTo, blockerLine, blockers, changedFields, counter, maxOf, type FieldName } from "./details";
import type { Draft } from "./draft";

describe("the Details form", () => {
  it("holds every writable field of the schema exactly once", () => {
    const shown = GROUPS.flatMap((g) => g.fields);
    const writable = Object.entries(schema.properties).filter(([, p]) => (p as { "x-writer": string })["x-writer"] !== "system").map(([name]) => name as FieldName);
    expect([...shown].sort()).toEqual(writable.filter((f) => !BY_ACTION.includes(f)).sort());
    expect(new Set(shown).size).toBe(shown.length);
  });

  it("takes limits by kind", () => {
    expect(maxOf("body", "post")).toBe(3000);
    expect(maxOf("body", "article")).toBe(100_000);
    expect(appliesTo("summary", "post")).toBe(false);
    expect(appliesTo("hashtags", "article")).toBe(false);
  });

  it("counts against the limit and the writing standard", () => {
    expect(counter("topic", "post", "Go")).toEqual({ text: "2/100", state: "ok" });
    expect(counter("topic", "post", "x".repeat(101)).state).toBe("over");
    expect(counter("hashtags", "post", ["a", "b"])).toEqual({ text: "2 · aim 3–5", state: "aside" });
    expect(counter("hashtags", "post", ["a", "b", "c"]).state).toBe("ok");
    expect(counter("hashtags", "post", []).state).toBe("ok");
    expect(counter("headline", "post", "Short data contracts win")).toEqual({ text: "4 words · aim 3–9", state: "ok" });
    expect(counter("summary", "article", "x".repeat(170))).toEqual({ text: "170 · aim up to 160", state: "aside" });
    expect(counter("summary", "article", "x".repeat(301)).state).toBe("over");
  });

  it("names what stops an approval", () => {
    expect(blockerLine(blockers({ kind: "post" }, { value: " ", length: 0 }))).toBe("1 missing: Body");
    expect(blockerLine(blockers({ kind: "post" }, { value: "x", length: 3001 }))).toBe("Over the limit: Body");
    expect(blockerLine(blockers({ kind: "article" }, { value: "x", length: 3001 }))).toBe("");
  });

  it("says which fields changed", () => {
    const d = { kind: "post", title: "", doc: { type: "doc" }, hashtags: [], design: { title: "Old", background: "mesh" } } as unknown as Draft;
    expect(changedFields(d, { ...d, hashtags: ["Go"], topic: "Go", design: { ...d.design!, title: "New", background: "dots" } })).toEqual(["hashtags", "topic", "headline"]);
    expect(changedFields(d, { ...d, topic: "" })).toEqual([]);
  });
});
