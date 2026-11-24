import { describe, expect, it } from "vitest";
import { docFromPlainText, flattenForPost, normalizeHashtag, type DocNode } from "./draft";
import { fold, LINKEDIN_LIMIT, serializeForLinkedIn, styleText } from "./linkedin";

const p = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const t = (text: string, ...marks: string[]): DocNode => ({ type: "text", text, ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}) });
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });
const li = (...content: DocNode[]): DocNode => ({ type: "listItem", content });
const ul = (...items: DocNode[]): DocNode => ({ type: "bulletList", content: items });
const ol = (...items: DocNode[]): DocNode => ({ type: "orderedList", attrs: { start: 1 }, content: items });

describe("serializeForLinkedIn", () => {
  it("separates paragraphs with a blank line and keeps hard breaks as single newlines", () => {
    const out = serializeForLinkedIn(doc(p(t("One"), { type: "hardBreak" }, t("two")), p(t("Three"))));
    expect(out.text).toBe("One\ntwo\n\nThree");
  });

  it("skips empty paragraphs instead of stacking blank lines", () => {
    expect(serializeForLinkedIn(doc(p(t("a")), p(), p(), p(t("b")))).text).toBe("a\n\nb");
  });

  it("writes bullet and numbered lists as lines", () => {
    const out = serializeForLinkedIn(doc(p(t("Why:")), ul(li(p(t("fast"))), li(p(t("small")))), ol(li(p(t("one"))), li(p(t("two"))))));
    expect(out.text).toBe("Why:\n\n• fast\n• small\n\n1. one\n2. two");
  });

  it("indents nested lists", () => {
    const out = serializeForLinkedIn(doc(ul(li(p(t("a")), ul(li(p(t("b"))))), li(p(t("c"))))));
    expect(out.text).toBe("• a\n  • b\n• c");
  });

  it("appends hashtags as the last line, adding # only once", () => {
    const out = serializeForLinkedIn(doc(p(t("Hi"))), { hashtags: ["Go", "#AI"] });
    expect(out.text).toBe("Hi\n\n#Go #AI");
  });

  it("returns an empty string for an empty document", () => {
    expect(serializeForLinkedIn(doc(p())).text).toBe("");
  });

  it("drops bold and italic by default and says so", () => {
    const out = serializeForLinkedIn(doc(p(t("plain "), t("loud", "bold"))));
    expect(out.text).toBe("plain loud");
    expect(out.warnings.map((w) => w.code)).toEqual(["styles-dropped"]);
  });

  it("maps bold and italic to Unicode only when asked, with an accessibility warning", () => {
    const out = serializeForLinkedIn(doc(p(t("Hi", "bold"), t(" ok", "italic"))), { unicodeStyles: true });
    expect(out.text).toBe("𝗛𝗶 𝘰𝘬");
    expect(out.warnings.map((w) => w.code)).toEqual(["styles-unicode"]);
  });

  it("writes link URLs out and warns", () => {
    const out = serializeForLinkedIn(doc(p({ type: "text", text: "docs", marks: [{ type: "link", attrs: { href: "https://x.io" } }] })));
    expect(out.text).toBe("docs (https://x.io)");
    expect(out.warnings.map((w) => w.code)).toContain("links-expanded");
  });

  it("counts code points, not UTF-16 units, against the limit", () => {
    const emoji = "😀".repeat(LINKEDIN_LIMIT); // 2 UTF-16 units each
    const out = serializeForLinkedIn(doc(p(t(emoji))));
    expect(out.length).toBe(LINKEDIN_LIMIT);
    expect(out.overLimit).toBe(false);
    expect(serializeForLinkedIn(doc(p(t(emoji + "a")))).overLimit).toBe(true);
  });

  it("counts the hashtag line toward the limit", () => {
    const out = serializeForLinkedIn(doc(p(t("a".repeat(LINKEDIN_LIMIT - 3)))), { hashtags: ["x"] });
    expect(out.overLimit).toBe(true); // 2997 + "\n\n" + "#x" = 3001
  });
});

describe("styleText", () => {
  it("styles letters and, for bold, digits; leaves other characters", () => {
    expect(styleText("Aa1 é!", true, false)).toBe("𝗔𝗮𝟭 é!");
    expect(styleText("Aa1", false, true)).toBe("𝘈𝘢1");
    expect(styleText("Aa", true, true)).toBe("𝘼𝙖");
    expect(styleText("abc", false, false)).toBe("abc");
  });
});

describe("fold", () => {
  it("leaves short text alone", () => {
    expect(fold("short")).toEqual({ shown: "short", truncated: false });
  });
  it("cuts long text at 210 characters", () => {
    const f = fold("a".repeat(500));
    expect(f.truncated).toBe(true);
    expect(f.shown.length).toBe(210);
  });
  it("cuts after three lines", () => {
    const f = fold("1\n2\n3\n4\n5");
    expect(f).toEqual({ shown: "1\n2\n3", truncated: true });
  });
});

describe("draft helpers", () => {
  it("docFromPlainText splits paragraphs and keeps single newlines as hard breaks", () => {
    const d = docFromPlainText("a\nb\n\nc");
    expect(serializeForLinkedIn(d).text).toBe("a\nb\n\nc");
    expect(d.content).toHaveLength(2);
  });
  it("docFromPlainText gives an editable empty document for blank input", () => {
    expect(docFromPlainText("  \n ").content).toEqual([{ type: "paragraph" }]);
  });
  it("normalizeHashtag keeps letters, digits and underscores only", () => {
    expect(normalizeHashtag("#Data & AI!")).toBe("DataAI");
    expect(normalizeHashtag("##go_lang")).toBe("go_lang");
    expect(normalizeHashtag("Données")).toBe("Données");
    expect(normalizeHashtag("###")).toBe("");
  });
  it("flattenForPost simplifies an article without losing text or lists", () => {
    const article = doc(
      { type: "heading", attrs: { level: 2 }, content: [t("Title")] },
      p({ type: "text", text: "see ", marks: [{ type: "bold" }] }, { type: "text", text: "docs", marks: [{ type: "link", attrs: { href: "https://x.io" } }] }),
      { type: "blockquote", content: [p(t("quoted"))] },
      ul(li(p(t("item")))),
      { type: "horizontalRule" },
    );
    const flat = flattenForPost(article);
    expect(flat.content!.map((n) => n.type)).toEqual(["paragraph", "paragraph", "paragraph", "bulletList"]);
    expect(serializeForLinkedIn(flat).text).toBe("Title\n\nsee docs\n\nquoted\n\n• item");
    expect(JSON.stringify(flat)).not.toContain("link");
    expect(JSON.stringify(flat)).toContain("quoted");
  });
  it("an article's pictures, tables and code are handled in both forms", () => {
    const row = (...cells: string[]): DocNode => ({ type: "tableRow", content: cells.map((c) => ({ type: "tableCell", content: [p(t(c))] })) });
    const article = doc(
      p(t("Intro")),
      { type: "image", attrs: { src: "data:image/png;base64,AAAA", alt: "x" } },
      { type: "codeBlock", content: [t("select 1")] },
      { type: "table", content: [row("Name", "Rows"), row("orders", "12")] },
    );
    // the plain text keeps the words and the table rows, and has nothing for the picture
    expect(serializeForLinkedIn(article).text).toBe("Intro\n\nselect 1\n\nName | Rows\norders | 12");
    // as a post: no picture, the table becomes one paragraph per row
    const flat = flattenForPost(article);
    expect(flat.content!.map((n) => n.type)).toEqual(["paragraph", "paragraph", "paragraph", "paragraph"]);
    expect(JSON.stringify(flat)).not.toContain("base64");
    expect(serializeForLinkedIn(flat).text).toBe("Intro\n\nselect 1\n\nName | Rows\n\norders | 12");
  });
});
