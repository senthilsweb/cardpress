import { describe, expect, it } from "vitest";
import { articleHtmlPage, docToMarkdown } from "./markdown";
import type { DocNode } from "./draft";

const t = (text: string, ...marks: string[]): DocNode => ({ type: "text", text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...c: DocNode[]): DocNode => ({ type: "paragraph", content: c });

describe("docToMarkdown", () => {
  it("writes headings, marks, links, lists, quotes, code, dividers and pictures", () => {
    const doc: DocNode = { type: "doc", content: [
      { type: "heading", attrs: { level: 1 }, content: [t("Title")] },
      p(t("Some "), t("bold", "bold"), t(" and "), t("italic", "italic"), t(" and "), t("code", "code"), t(" and "),
        { type: "text", text: "a link", marks: [{ type: "link", attrs: { href: "https://x.io" } }] }),
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("one"))] }, { type: "listItem", content: [p(t("two"))] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [p(t("first"))] }] },
      { type: "blockquote", content: [p(t("quoted"))] },
      { type: "codeBlock", attrs: { language: "sql" }, content: [t("select 1")] },
      { type: "horizontalRule" },
      { type: "image", attrs: { src: "data:image/png;base64,AAAA", alt: "chart" } },
    ] };
    expect(docToMarkdown(doc)).toBe([
      "# Title",
      "Some **bold** and *italic* and `code` and [a link](https://x.io)",
      "- one\n- two",
      "1. first",
      "> quoted",
      "```sql\nselect 1\n```",
      "---",
      "![chart](data:image/png;base64,AAAA)",
    ].join("\n\n") + "\n");
  });
  it("writes a table with a header row", () => {
    const row = (...cells: string[]): DocNode => ({ type: "tableRow", content: cells.map((c) => ({ type: "tableCell", content: [p(t(c))] })) });
    const md = docToMarkdown({ type: "doc", content: [{ type: "table", content: [row("Name", "Rows"), row("orders", "12")] }] });
    expect(md).toBe("| Name | Rows |\n| --- | --- |\n| orders | 12 |\n");
  });
  it("wraps the body in a page and escapes the title", () => {
    const page = articleHtmlPage("A <b> & c", "<p>x</p>");
    expect(page).toContain("<title>A &lt;b&gt; &amp; c</title>");
    expect(page).toContain("<p>x</p>");
  });
});
