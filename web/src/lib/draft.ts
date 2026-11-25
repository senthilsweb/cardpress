import type { Design } from "./types";

/** A rich-text document in TipTap/ProseMirror JSON. */
export interface DocNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocNode[];
}

/** One picture of a post with several. Its bytes are fetched separately. */
export interface DraftPicture { id: string; type: string; altText: string; size?: number }

export type DraftKind = "post" | "article";
/** draft, then approved, then scheduled (a post is waiting) and published. An edit returns approved or published to draft. */
export type DraftStatus = "draft" | "approved" | "scheduled" | "published";

export interface Draft {
  id: string;
  /** Moves with every change to what the draft says or shows; a save based on an older one is refused. */
  revision: number;
  profileId: string;
  kind: DraftKind;
  status: DraftStatus;
  doc: DocNode;
  hashtags: string[];
  altText: string;
  unicodeStyles: boolean;
  title: string;
  /** The card this item was made with. Absent on a draft that has not been given one yet. */
  design?: Design;
  approvedAt?: string;
  /** An article's planned date (UTC). Nothing is sent. */
  scheduledAt?: string;
  timezone?: string;
  /** The public page: its address within its kind, its description, when it went live, and whether it has a preview image. */
  slug?: string;
  summary?: string;
  pageAt?: string;
  hasCover?: boolean;
  /** What a post goes out with: the designed card, or a file of its own (a picture, or a PDF document with a title). */
  attachment?: "card" | "image" | "document" | "images" | "video";
  attachmentTitle?: string;
  /** The public address of a post's video, and the file's size when it was checked. */
  videoUrl?: string;
  videoSize?: number;
  /** Bytes of a post's own picture or document. */
  attachmentSize?: number;
  /** The pictures of a post whose attachment is "images", in order. */
  images?: DraftPicture[];
  /** Who wrote it and who approved it, for showing. */
  createdByName?: string;
  approvedByName?: string;
  createdAt: string;
  updatedAt: string;
}

/** The fields a caller may change. */
export type DraftInput = Pick<Draft, "profileId" | "kind" | "doc" | "hashtags" | "altText" | "unicodeStyles"> & { title?: string; design?: Design };

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
  const cellText = (cell: DocNode): string => (cell.content ?? []).map((p) => (p.content ?? []).map((t) => t.text ?? "").join("")).join(" ").trim();
  const walk = (n: DocNode): DocNode[] => {
    if (n.type === "horizontalRule" || n.type === "image") return [];
    // a table has no place in a post: each row becomes a paragraph of its cells
    if (n.type === "table") {
      return (n.content ?? [])
        .map((row) => (row.content ?? []).map(cellText).join(" | ").trim())
        .filter(Boolean)
        .map((text): DocNode => ({ type: "paragraph", content: [{ type: "text", text }] }));
    }
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
