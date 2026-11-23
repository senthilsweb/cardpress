import type { Draft, DocNode } from "./draft";

/** LinkedIn's limit for a post's text, in characters. */
export const LINKEDIN_LIMIT = 3000;
/** Roughly where the feed cuts a post off with "…see more". It varies by device. */
export const FOLD_CHARS = 210;
export const FOLD_LINES = 3;

export type Warning =
  | { code: "styles-dropped"; message: string }
  | { code: "styles-unicode"; message: string }
  | { code: "links-expanded"; message: string };

export interface Serialized {
  text: string;
  /** Characters as LinkedIn counts them (code points, not UTF-16 units). */
  length: number;
  overLimit: boolean;
  warnings: Warning[];
}

export interface Options {
  /** Turn bold and italic into Unicode styled letters. Off by default: screen readers read them badly. */
  unicodeStyles?: boolean;
  /** Appended as a final "#a #b" line. */
  hashtags?: string[];
}

const count = (s: string) => Array.from(s).length;

/* Mathematical sans-serif letters: no gaps in the ranges, so a plain offset works. */
const BOLD = { upper: 0x1d5d4, lower: 0x1d5ee, digit: 0x1d7ec };
const ITALIC = { upper: 0x1d608, lower: 0x1d622 };
const BOLD_ITALIC = { upper: 0x1d63c, lower: 0x1d656 };

/** Map ASCII letters (and digits, for bold) to Unicode styled characters. Everything else is left alone. */
export function styleText(text: string, bold: boolean, italic: boolean): string {
  if (!bold && !italic) return text;
  const set = bold && italic ? BOLD_ITALIC : bold ? BOLD : ITALIC;
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c >= 65 && c <= 90) out += String.fromCodePoint(set.upper + c - 65);
    else if (c >= 97 && c <= 122) out += String.fromCodePoint(set.lower + c - 97);
    else if (bold && !italic && c >= 48 && c <= 57) out += String.fromCodePoint(BOLD.digit + c - 48);
    else out += ch;
  }
  return out;
}

interface Ctx { opts: Options; warnings: Map<string, Warning> }

function inline(nodes: DocNode[] | undefined, ctx: Ctx): string {
  let out = "";
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") { out += "\n"; continue; }
    if (n.type !== "text") { out += inline(n.content, ctx); continue; }
    let t = n.text ?? "";
    const marks = new Set((n.marks ?? []).map((m) => m.type));
    const bold = marks.has("bold"), italic = marks.has("italic");
    if (bold || italic) {
      if (ctx.opts.unicodeStyles) {
        t = styleText(t, bold, italic);
        ctx.warnings.set("styles-unicode", { code: "styles-unicode", message: "Bold and italic are sent as special Unicode characters. Screen readers may read them letter by letter, and search will not match them." });
      } else {
        ctx.warnings.set("styles-dropped", { code: "styles-dropped", message: "Bold and italic are not supported by LinkedIn posts, so they are left out. Turn on Unicode styles to keep them." });
      }
    }
    const link = (n.marks ?? []).find((m) => m.type === "link");
    const href = link?.attrs?.href;
    if (typeof href === "string" && href && href !== t) {
      t = `${t} (${href})`;
      ctx.warnings.set("links-expanded", { code: "links-expanded", message: "Links are written out as plain URLs; LinkedIn posts have no link text." });
    }
    out += t;
  }
  return out;
}

/** Lines for one block. Lists indent by two spaces per level. */
function block(n: DocNode, ctx: Ctx, indent = ""): string[] {
  switch (n.type) {
    case "bulletList":
    case "orderedList": {
      const lines: string[] = [];
      (n.content ?? []).forEach((item, i) => {
        const marker = n.type === "orderedList" ? `${Number(n.attrs?.start ?? 1) + i}. ` : "• ";
        let first = true;
        for (const child of item.content ?? []) {
          for (const line of block(child, ctx, indent + "  ")) {
            if (child.type === "bulletList" || child.type === "orderedList") lines.push(line);
            else { lines.push(first ? `${indent}${marker}${line.trimStart()}` : `${indent}  ${line.trimStart()}`); first = false; }
          }
        }
      });
      return lines;
    }
    case "blockquote":
      return (n.content ?? []).flatMap((c) => block(c, ctx, indent));
    case "horizontalRule":
      return [];
    default: {
      // paragraph, heading, code block and anything else that holds text
      const text = inline(n.content, ctx);
      return text.trim() ? text.split("\n").map((l) => indent + l) : [];
    }
  }
}

/** Convert a document to the plain text LinkedIn will receive. Deterministic, no network. */
export function serializeForLinkedIn(doc: DocNode, opts: Options = {}): Serialized {
  const ctx: Ctx = { opts, warnings: new Map() };
  const blocks = (doc.content ?? []).map((n) => block(n, ctx).join("\n")).filter((b) => b.trim() !== "");
  const tags = (opts.hashtags ?? []).filter(Boolean).map((t) => `#${t.replace(/^#/, "")}`);
  if (tags.length) blocks.push(tags.join(" "));
  const text = blocks.join("\n\n");
  const length = count(text);
  return { text, length, overLimit: length > LINKEDIN_LIMIT, warnings: [...ctx.warnings.values()] };
}

/** Plain-text version of a document with no hashtags and no styling, e.g. the text/plain flavour of a copy. */
export function docToPlainText(doc: DocNode): string {
  return serializeForLinkedIn(doc).text;
}

/** What a feed shows before its "more" link: at most `chars` characters and `lines` lines. */
export function foldAt(text: string, chars: number, lines = FOLD_LINES): { shown: string; truncated: boolean } {
  const all = text.split("\n");
  const truncated = count(text) > chars || all.length > lines;
  if (!truncated) return { shown: text, truncated: false };
  const head = Array.from(all.slice(0, lines).join("\n"));
  return { shown: (head.length > chars ? head.slice(0, chars).join("") : head.join("")).trimEnd(), truncated: true };
}

/** The LinkedIn fold. */
export const fold = (text: string) => foldAt(text, FOLD_CHARS, FOLD_LINES);

/** The text a draft would send (posts) or the plain text of the article. */
export function serializeDraft(d: Pick<Draft, "kind" | "doc" | "hashtags" | "unicodeStyles">): Serialized {
  return d.kind === "article"
    ? serializeForLinkedIn(d.doc)
    : serializeForLinkedIn(d.doc, { unicodeStyles: d.unicodeStyles, hashtags: d.hashtags });
}
