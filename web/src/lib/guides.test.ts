import { describe, expect, it } from "vitest";
import { guideLength, guideProblem } from "./guides";
import { blocks, spans } from "./mdPreview";

describe("writing guides", () => {
  it("counts as the server does", () => {
    expect(guideLength("  a👍\r\nb  ")).toBe(4);
    expect(guideProblem("abc", 3)).toBeNull();
    expect(guideProblem("abcd", 3)).toMatch(/4 of 3/);
  });
});

describe("the preview of a guide", () => {
  it("reads headings, lists, quotes, tables and paragraphs", () => {
    const got = blocks("## Voice\nPlain\nwords.\n\n- one\n  - two\n    still two\n1. first\n\n> said\n> twice\n\n| Do | Don't |\n|---|---|\n| short | long |\n\n---");
    expect(got.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "quote", "table", "rule"]);
    expect(got[2]).toMatchObject({ ordered: false, items: [{ depth: 0 }, { depth: 1, spans: [{ text: "two still two" }] }, { depth: 0 }] });
    expect(got[4]).toMatchObject({ head: [[{ text: "Do" }], [{ text: "Don't" }]], rows: [[[{ text: "short" }], [{ text: "long" }]]] });
  });
  it("reads bold, italic, code and web links, and leaves the rest as text", () => {
    expect(spans("a **b** *c* `d` [e](https://x.example)").map((s) => s.type)).toEqual(["text", "bold", "text", "italic", "text", "code", "text", "link"]);
    expect(spans("snake_case_name and <b>x</b> [y](javascript:alert(1))")).toEqual([{ type: "text", text: "snake_case_name and <b>x</b> [y](javascript:alert(1))" }]);
  });
  it("ends on odd input", () => {
    for (const odd of ["|", "**", "- ", "#", "> ", "|\n|---|", "[]()", "*".repeat(500)]) expect(() => blocks(odd)).not.toThrow();
  });
});
