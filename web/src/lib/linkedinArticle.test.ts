import { describe, expect, it } from "vitest";
import { toLinkedInArticle } from "./linkedinArticle";
import type { DocNode } from "./draft";

const t = (text: string, ...marks: string[]): DocNode => ({ type: "text", text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const p = (...c: DocNode[]): DocNode => ({ type: "paragraph", content: c });
const doc = (...c: DocNode[]): DocNode => ({ type: "doc", content: c });
const row = (head: boolean, ...cells: string[]): DocNode => ({ type: "tableRow", content: cells.map((c) => ({ type: head ? "tableHeader" : "tableCell", content: [p(t(c))] })) });

describe("toLinkedInArticle", () => {
  it("takes the first title out of the body and keeps two heading levels", () => {
    const a = toLinkedInArticle(doc(
      { type: "heading", attrs: { level: 1 }, content: [t("The title")] },
      { type: "heading", attrs: { level: 2 }, content: [t("A heading")] },
      { type: "heading", attrs: { level: 3 }, content: [t("A subheading")] },
      { type: "heading", attrs: { level: 1 }, content: [t("A second H1")] },
    ));
    expect(a.title).toBe("The title");
    expect(a.html).toBe("<h2>A heading</h2>\n<h3>A subheading</h3>\n<h2>A second H1</h2>");
    expect(a.notes).toEqual([]);
  });
  it("uses the given title when the text has none", () => {
    expect(toLinkedInArticle(doc(p(t("Just text"))), "From the title field").title).toBe("From the title field");
  });
  it("keeps bold, italic, underline and links, and says what loses its styling", () => {
    const a = toLinkedInArticle(doc(p(t("a", "bold"), t("b", "italic"), t("c", "underline"), t("d", "strike"), t("e", "code"),
      { type: "text", text: "f", marks: [{ type: "link", attrs: { href: "https://x.io?a=1&b=2" } }] })));
    expect(a.html).toBe('<p><strong>a</strong><em>b</em><u>c</u>de<a href="https://x.io?a=1&amp;b=2">f</a></p>');
    expect(a.notes).toEqual(["Strikethrough and inline code lose their styling."]);
  });
  it("turns a table into a list of rows, using the header names", () => {
    const a = toLinkedInArticle(doc({ type: "table", content: [row(true, "Layer", "Tables"), row(false, "Bronze", "7"), row(false, "Silver", "11")] }));
    expect(a.html).toBe("<ul><li>Layer: Bronze; Tables: 7</li><li>Layer: Silver; Tables: 11</li></ul>");
    expect(a.notes[0]).toContain("1 table became a list of rows");
    expect(a.text).toContain("Layer: Bronze; Tables: 7");
  });
  it("leaves a marker for each picture and keeps the file aside", () => {
    const a = toLinkedInArticle(doc(p(t("Before")), { type: "image", attrs: { src: "data:image/jpeg;base64,AAAA", alt: "a chart" } }, { type: "image", attrs: { src: "data:image/png;base64,BBBB", alt: "" } }));
    expect(a.html).toContain("<p>[Picture 1: a chart]</p>");
    expect(a.html).toContain("<p>[Picture 2]</p>");
    expect(a.html).not.toContain("base64");
    expect(a.pictures.map((x) => x.name)).toEqual(["picture-01.jpg", "picture-02.png"]);
    expect(a.notes[0]).toContain("2 pictures cannot be pasted");
  });
  it("keeps lists, quotes and code, and drops dividers", () => {
    const a = toLinkedInArticle(doc(
      { type: "bulletList", content: [{ type: "listItem", content: [p(t("one"))] }, { type: "listItem", content: [p(t("two"))] }] },
      { type: "blockquote", content: [p(t("quoted"))] },
      { type: "codeBlock", content: [t("select 1 < 2")] },
      { type: "horizontalRule" },
    ));
    expect(a.html).toBe("<ul><li>one</li><li>two</li></ul>\n<blockquote><p>quoted</p></blockquote>\n<pre><code>select 1 &lt; 2</code></pre>");
    expect(a.notes).toEqual(["1 divider left out."]);
  });
});
