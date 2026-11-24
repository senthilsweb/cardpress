import type { DocNode } from "./draft";

/** A picture taken out of the text, to be added by hand where its marker stands. */
export interface ArticlePicture { name: string; dataUrl: string; alt: string }

export interface LinkedInArticle {
  /** The article's title. LinkedIn takes it in its own field, so it is not repeated in the body. */
  title: string;
  /** The body as HTML limited to what an article can hold. */
  html: string;
  /** The same body as plain text, for a paste that cannot carry formatting. */
  text: string;
  pictures: ArticlePicture[];
  /** What had to change, in words a person can act on. Empty when nothing did. */
  notes: string[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const plain = (n: DocNode | undefined): string =>
  !n ? "" : n.type === "text" ? n.text ?? "" : n.type === "hardBreak" ? " " : (n.content ?? []).map(plain).join("");

interface Count { strike: number; code: number; dividers: number; tables: number }

function inline(nodes: DocNode[] | undefined, c: Count): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") { out += "<br>"; continue; }
    if (n.type !== "text") { out += inline(n.content, c); continue; }
    const marks = new Set((n.marks ?? []).map((m) => m.type));
    let t = esc(n.text ?? "");
    if (marks.has("strike")) c.strike++;
    if (marks.has("code")) c.code++;
    if (marks.has("bold")) t = `<strong>${t}</strong>`;
    if (marks.has("italic")) t = `<em>${t}</em>`;
    if (marks.has("underline")) t = `<u>${t}</u>`;
    const link = (n.marks ?? []).find((m) => m.type === "link");
    if (link) t = `<a href="${esc(String(link.attrs?.href ?? ""))}">${t}</a>`;
    out += t;
  }
  return out;
}

const extOf = (dataUrl: string) => ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" })[dataUrl.match(/^data:([^;,]+)/)?.[1] ?? ""] ?? "png";

/**
 * An article as LinkedIn's article editor takes it. That editor has a title, two levels of heading, bold, italic and
 * underline, lists, quotes, links and pictures, but no tables, and a picture has to be added in the editor itself. So:
 * the first title becomes the title, headings stay, a table becomes a list of rows, a divider is dropped, and each picture
 * is left as a marker with the file kept aside.
 */
export function toLinkedInArticle(doc: DocNode, fallbackTitle = ""): LinkedInArticle {
  const c: Count = { strike: 0, code: 0, dividers: 0, tables: 0 };
  const pictures: ArticlePicture[] = [];
  const texts: string[] = [];
  let title = "";

  const list = (n: DocNode): string => {
    const tag = n.type === "orderedList" ? "ol" : "ul";
    const items = (n.content ?? []).map((li) => `<li>${(li.content ?? []).map((b) => (b.type === "paragraph" ? inline(b.content, c) : block(b, false))).join("")}</li>`);
    return `<${tag}>${items.join("")}</${tag}>`;
  };
  const table = (n: DocNode): string => {
    c.tables++;
    const rows = (n.content ?? []).map((r) => (r.content ?? []).map((cell) => plain(cell).trim()));
    const head = n.content?.[0]?.content?.every((cell) => cell.type === "tableHeader") ? rows[0] : null;
    const body = head ? rows.slice(1) : rows;
    const lines = body.map((cells) => (head ? cells.map((v, i) => `${head[i] ?? ""}: ${v}`).join("; ") : cells.join(" | "))).filter((l) => l.replace(/[\s:;|]/g, "") !== "");
    texts.push(...lines);
    return `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
  };
  function block(n: DocNode, top = true): string {
    switch (n.type) {
      case "heading": {
        const level = Number(n.attrs?.level ?? 2);
        const t = plain(n).trim();
        if (top && level === 1 && !title) { title = t; return ""; }
        texts.push(t);
        return `<h${level === 3 ? 3 : 2}>${inline(n.content, c)}</h${level === 3 ? 3 : 2}>`;
      }
      case "paragraph": { const h = inline(n.content, c); if (!plain(n).trim()) return ""; texts.push(plain(n)); return `<p>${h}</p>`; }
      case "bulletList": case "orderedList": texts.push(plain(n)); return list(n);
      case "blockquote": texts.push(plain(n)); return `<blockquote>${(n.content ?? []).map((b) => block(b, false)).join("")}</blockquote>`;
      case "codeBlock": texts.push(plain(n)); return `<pre><code>${esc(plain(n))}</code></pre>`;
      case "horizontalRule": c.dividers++; return "";
      case "table": return table(n);
      case "image": {
        const src = String(n.attrs?.src ?? "");
        const alt = String(n.attrs?.alt ?? "");
        const name = `picture-${String(pictures.length + 1).padStart(2, "0")}.${extOf(src)}`;
        pictures.push({ name, dataUrl: src, alt });
        const marker = `[Picture ${pictures.length}${alt ? `: ${alt}` : ""}]`;
        texts.push(marker);
        return `<p>${esc(marker)}</p>`;
      }
      default: return inline(n.content, c) ? `<p>${inline(n.content, c)}</p>` : "";
    }
  }
  const html = (doc.content ?? []).map((n) => block(n)).filter(Boolean).join("\n");

  const notes: string[] = [];
  if (c.tables) notes.push(`${plural(c.tables, "table")} became a list of rows: LinkedIn articles have no tables.`);
  if (pictures.length) notes.push(`${plural(pictures.length, "picture")} cannot be pasted: add ${pictures.length === 1 ? "it" : "them"} in LinkedIn where the [Picture] marker${pictures.length === 1 ? " is" : "s are"}. ${pictures.length === 1 ? "The file is" : "The files are"} in the download.`);
  if (c.dividers) notes.push(`${plural(c.dividers, "divider")} left out.`);
  if (c.strike || c.code) notes.push("Strikethrough and inline code lose their styling.");
  return { title: title || fallbackTitle, html, text: texts.join("\n\n"), pictures, notes };
}
