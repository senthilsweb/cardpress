import test from "node:test";
import assert from "node:assert/strict";
import { markdownToDoc, plainToDoc } from "./md-to-doc.mjs";

const types = (doc) => doc.content.map((n) => n.type);

test("headings, paragraphs and marks", async () => {
  const doc = await markdownToDoc("# Title\n\nSome **bold**, *italic*, `code` and [a link](https://x.io).\n");
  assert.deepEqual(types(doc), ["heading", "paragraph"]);
  assert.equal(doc.content[0].attrs.level, 1);
  const p = doc.content[1].content;
  assert.deepEqual(p.find((n) => n.text === "bold").marks, [{ type: "bold" }]);
  assert.deepEqual(p.find((n) => n.text === "code").marks, [{ type: "code" }]);
  assert.deepEqual(p.find((n) => n.text === "a link").marks, [{ type: "link", attrs: { href: "https://x.io" } }]);
});

test("deeper headings are held at level 3", async () => {
  const doc = await markdownToDoc("#### Deep\n");
  assert.equal(doc.content[0].attrs.level, 3);
});

test("lists, nested lists, quotes, code and dividers", async () => {
  const doc = await markdownToDoc("- one\n- two\n  - nested\n\n3. three\n4. four\n\n> quoted\n\n```sql\nselect 1\n```\n\n---\n");
  assert.deepEqual(types(doc), ["bulletList", "orderedList", "blockquote", "codeBlock", "horizontalRule"]);
  assert.equal(doc.content[0].content.length, 2);
  assert.equal(doc.content[0].content[1].content[1].type, "bulletList");
  assert.equal(doc.content[1].attrs.start, 3);
  assert.equal(doc.content[3].attrs.language, "sql");
  assert.equal(doc.content[3].content[0].text, "select 1");
});

test("a table has a header row and body rows", async () => {
  const doc = await markdownToDoc("| a | b |\n| - | - |\n| 1 | 2 |\n");
  const rows = doc.content[0].content;
  assert.equal(doc.content[0].type, "table");
  assert.equal(rows[0].content[0].type, "tableHeader");
  assert.equal(rows[1].content[1].type, "tableCell");
  assert.equal(rows[1].content[1].content[0].content[0].text, "2");
});

test("a picture becomes an image block where the reader supplies it, and is left out otherwise", async () => {
  const md = "Before\n\n![a chart](chart.png)\n\nAfter\n";
  const without = await markdownToDoc(md);
  assert.deepEqual(types(without), ["paragraph", "paragraph"]);
  const seen = [];
  const doc = await markdownToDoc(md, { image: async (href, alt) => { seen.push(href); return { type: "image", attrs: { src: "data:image/png;base64,AAAA", alt } }; } });
  assert.deepEqual(types(doc), ["paragraph", "image", "paragraph"]);
  assert.deepEqual(seen, ["chart.png"]);
  assert.equal(doc.content[1].attrs.alt, "a chart");
});

test("an empty text is still a valid document", async () => {
  assert.deepEqual(await markdownToDoc(""), { type: "doc", content: [{ type: "paragraph" }] });
});

test("plain text keeps paragraphs and line breaks", () => {
  const doc = plainToDoc("One line\nsecond line\n\nNext paragraph");
  assert.equal(doc.content.length, 2);
  assert.deepEqual(doc.content[0].content.map((n) => n.type), ["text", "hardBreak", "text"]);
});
