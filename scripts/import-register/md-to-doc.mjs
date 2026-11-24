// Markdown to the editor's document (TipTap/ProseMirror JSON). No network, no disk except for pictures, which are read
// through `readImage` so a test can supply its own.
import { marked } from "marked";

const text = (t, marks) => (t === "" ? null : { type: "text", text: t, ...(marks.length ? { marks } : {}) });
const para = (content) => ({ type: "paragraph", ...(content.length ? { content } : {}) });

/** Inline tokens to text nodes with marks. A picture inside a paragraph is returned separately so it can become a block. */
function inlines(tokens, marks, out, pictures) {
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "text":
      case "escape":
        if (t.tokens?.length) inlines(t.tokens, marks, out, pictures);
        else { const n = text(t.text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), marks); if (n) out.push(n); }
        break;
      case "strong": inlines(t.tokens, [...marks, { type: "bold" }], out, pictures); break;
      case "em": inlines(t.tokens, [...marks, { type: "italic" }], out, pictures); break;
      case "del": inlines(t.tokens, [...marks, { type: "strike" }], out, pictures); break;
      case "codespan": { const n = text(t.text, [...marks, { type: "code" }]); if (n) out.push(n); break; }
      case "link": inlines(t.tokens, [...marks, { type: "link", attrs: { href: t.href } }], out, pictures); break;
      case "br": out.push({ type: "hardBreak" }); break;
      case "image": pictures.push({ href: t.href, alt: t.text ?? "" }); break;
      case "html": break; // raw HTML has no place in the document
      default: { const n = text(t.raw ?? "", marks); if (n) out.push(n); }
    }
  }
}

async function blocks(tokens, ctx) {
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case "heading": {
        const c = [], pics = [];
        inlines(t.tokens, [], c, pics);
        out.push({ type: "heading", attrs: { level: Math.min(3, Math.max(1, t.depth)) }, content: c.length ? c : undefined });
        break;
      }
      case "paragraph": {
        const c = [], pics = [];
        inlines(t.tokens, [], c, pics);
        if (c.length) out.push(para(c));
        for (const p of pics) { const img = await ctx.image(p.href, p.alt); if (img) out.push(img); }
        break;
      }
      case "list": {
        const items = [];
        for (const it of t.items) {
          const inner = await blocks(it.tokens.map((x) => (x.type === "text" ? { type: "paragraph", tokens: x.tokens ?? [{ type: "text", text: x.text }], raw: x.raw, text: x.text } : x)), ctx);
          items.push({ type: "listItem", content: inner.length ? inner : [para([])] });
        }
        out.push({ type: t.ordered ? "orderedList" : "bulletList", ...(t.ordered && t.start && t.start !== 1 ? { attrs: { start: t.start } } : {}), content: items });
        break;
      }
      case "blockquote": out.push({ type: "blockquote", content: await blocks(t.tokens, ctx) }); break;
      case "code": out.push({ type: "codeBlock", ...(t.lang ? { attrs: { language: t.lang } } : {}), ...(t.text ? { content: [{ type: "text", text: t.text }] } : {}) }); break;
      case "hr": out.push({ type: "horizontalRule" }); break;
      case "table": {
        const cell = async (c, type) => { const x = [], pics = []; inlines(c.tokens, [], x, pics); return { type, content: [para(x)] }; };
        const rows = [{ type: "tableRow", content: await Promise.all(t.header.map((c) => cell(c, "tableHeader"))) }];
        for (const r of t.rows) rows.push({ type: "tableRow", content: await Promise.all(r.map((c) => cell(c, "tableCell"))) });
        out.push({ type: "table", content: rows });
        break;
      }
      case "html": case "space": break;
      default: if (t.text) out.push(para([text(t.text, [])].filter(Boolean)));
    }
  }
  return out;
}

/**
 * @param {string} markdown
 * @param {{ image?: (href: string, alt: string) => Promise<object|null> }} [opts] turns a picture reference into an image node (or null to leave it out)
 */
export async function markdownToDoc(markdown, opts = {}) {
  const ctx = { image: opts.image ?? (async () => null) };
  const tokens = marked.lexer(markdown);
  const content = await blocks(tokens, ctx);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** A post's plain paragraphs to a document: a blank line separates paragraphs, a single newline is a line break. */
export function plainToDoc(body) {
  const paras = body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    type: "doc",
    content: paras.length ? paras.map((p) => {
      const c = [];
      p.split("\n").forEach((line, i) => { if (i > 0) c.push({ type: "hardBreak" }); if (line) c.push({ type: "text", text: line }); });
      return para(c);
    }) : [{ type: "paragraph" }],
  };
}
