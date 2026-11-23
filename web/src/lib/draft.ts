/** A rich-text document in TipTap/ProseMirror JSON. */
export interface DocNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocNode[];
}

export type DraftKind = "post" | "article";

export interface Draft {
  id: string;
  profileId: string;
  kind: DraftKind;
  status: string;
  doc: DocNode;
  hashtags: string[];
  altText: string;
  unicodeStyles: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The fields a caller may change. */
export type DraftInput = Pick<Draft, "profileId" | "kind" | "doc" | "hashtags" | "altText" | "unicodeStyles">;

export const EMPTY_DOC: DocNode = { type: "doc", content: [{ type: "paragraph" }] };

/** Plain text (blank line between paragraphs, single newline inside one) to a document. */
export function docFromPlainText(text: string): DocNode {
  const paras = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length) return EMPTY_DOC;
  return {
    type: "doc",
    content: paras.map((p) => {
      const content: DocNode[] = [];
      p.split("\n").forEach((line, i) => {
        if (i > 0) content.push({ type: "hardBreak" });
        if (line) content.push({ type: "text", text: line });
      });
      return { type: "paragraph", content };
    }),
  };
}

/** "#Data AI" -> "DataAI". Returns "" when nothing usable is left. */
export function normalizeHashtag(raw: string): string {
  return raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 100);
}

const POST_MARKS = new Set(["bold", "italic"]);
const TEXT_BLOCKS = new Set(["heading", "blockquote", "codeBlock"]);

/**
 * Simplify an article document so it fits the post schema (paragraphs, lists, bold and italic only):
 * headings, quotes and code become paragraphs, links keep only their text, other marks are dropped.
 */
export function flattenForPost(doc: DocNode): DocNode {
  const fixInline = (n: DocNode): DocNode => {
    if (n.type !== "text") return n;
    const marks = (n.marks ?? []).filter((m) => POST_MARKS.has(m.type));
    return marks.length ? { ...n, marks } : { type: "text", text: n.text };
  };
  const walk = (n: DocNode): DocNode[] => {
    if (n.type === "horizontalRule") return [];
    if (TEXT_BLOCKS.has(n.type)) {
      // a quote holds paragraphs; keep each as its own paragraph
      if (n.type === "blockquote") return (n.content ?? []).flatMap(walk);
      return [{ type: "paragraph", content: (n.content ?? []).map(fixInline) }];
    }
    if (n.type === "text") return [fixInline(n)];
    if (n.content) return [{ ...n, content: n.content.flatMap(walk) }];
    return [n];
  };
  const content = (doc.content ?? []).flatMap(walk);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
