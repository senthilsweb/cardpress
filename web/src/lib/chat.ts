import type { DocNode, DraftKind } from "./draft";
import { EMPTY_DOC } from "./draft";

export type ProposalStatus = "pending" | "approved" | "rejected" | "superseded";

/** Content an agent suggested. It reaches a draft only when the person approves it. */
export interface Proposal {
  id: string;
  conversationId: string;
  messageId: string;
  kind: DraftKind;
  title: string;
  body: string;
  hashtags: string[];
  altText: string;
  rationale: string;
  status: ProposalStatus;
  edited: boolean;
  draftId?: string;
  createdAt: string;
  decidedAt?: string;
}

/** Something a conversation writes from. Its text stays on the server. */
export interface ChatSource {
  id: string;
  /** The message it went with; empty until sent. */
  messageId?: string;
  kind: "url" | "text" | "md" | "docx" | "pdf";
  name: string;
  url?: string;
  chars: number;
  truncated: boolean;
}

export interface SavedVersion { draftId: string; kind: DraftKind; version: number }
export interface ReplyCheck { kind: DraftKind; passed: boolean; round?: number; note?: string }
/** The assistant's short answer. One with no outcome was not reported: its last words, or a note from the studio. */
export interface ReplyReport { outcome?: "done" | "needs_answer" | "not_done"; message: string; points?: string[]; question?: string; next?: string }
/** What happened while a reply was written. */
export interface ReplyDetail { steps?: string[]; saved?: SavedVersion[]; checks?: ReplyCheck[]; reports?: ReplyReport[]; error?: string }
export interface ChatMessage {
  id: string; seq: number; role: "user" | "assistant"; content: string; createdAt: string;
  /** How a reply ended. */
  status?: "done" | "failed" | "stopped";
  detail?: ReplyDetail;
}
export interface AgentInfo { name: string; ai: boolean; /** False on a server with no assistant set up. */ ready: boolean }
/** What goes with a message besides its words. */
export interface ChatRequest { write: DraftKind[]; viewing?: DraftKind }

export interface Conversation {
  id: string;
  profileId: string;
  title: string;
  /** How it began: from a source of this kind, from a message alone ("topic"), or from an outside agent ("mcp"). */
  sourceKind: "url" | "text" | "topic" | "md" | "docx" | "pdf" | "mcp";
  sourceUrl?: string;
  sourceTitle?: string;
  sourceChars: number;
  sourceTruncated: boolean;
  /** Proposals waiting for a decision. */
  pending: number;
  /** The post and the article this conversation is about. */
  postDraftId?: string;
  articleDraftId?: string;
  agent: AgentInfo;
  createdAt: string;
  updatedAt: string;
  messages?: ChatMessage[];
  proposals?: Proposal[];
  sources?: ChatSource[];
  /** What it has cost at list price, in cents; absent when nothing was recorded. */
  costCents?: number;
}

/** What the person may change before approving. */
export interface ProposalEdit { kind: DraftKind; title: string; body: string; hashtags: string[]; altText: string }

const BULLET = /^\s*(?:[-•*])\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;

const text = (t: string): DocNode => ({ type: "text", text: t });
const para = (lines: string[]): DocNode => {
  const content: DocNode[] = [];
  lines.forEach((l, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    if (l) content.push(text(l));
  });
  return { type: "paragraph", content };
};
const item = (t: string): DocNode => ({ type: "listItem", content: [para([t])] });

/**
 * An agent's proposal is plain text: paragraphs separated by blank lines, "- " bullets, "1." numbered lines, and "## "
 * headings for an article. Turn it into the editor's document. A post cannot hold headings, so there they become
 * ordinary paragraphs.
 */
export function docFromAgentText(body: string, kind: DraftKind): DocNode {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: DocNode[] = [];
  let para_: string[] = [];
  let list: { type: "bulletList" | "orderedList"; items: string[] } | null = null;
  const flushPara = () => { if (para_.length) out.push(para(para_)); para_ = []; };
  const flushList = () => {
    if (list) out.push({ type: list.type, ...(list.type === "orderedList" ? { attrs: { start: 1 } } : {}), content: list.items.map(item) });
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h = HEADING.exec(line);
    if (h) {
      flushPara(); flushList();
      out.push(kind === "article"
        ? { type: "heading", attrs: { level: h[1].length <= 2 ? 2 : 3 }, content: [text(h[2].trim())] }
        : para([h[2].trim()]));
      continue;
    }
    const b = BULLET.exec(line), n = NUMBER.exec(line);
    if (b || n) {
      flushPara();
      const type = b ? "bulletList" : "orderedList";
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push((b ?? n)![1].trim());
      continue;
    }
    flushList();
    para_.push(line.trim());
  }
  flushPara(); flushList();
  return out.length ? { type: "doc", content: out } : EMPTY_DOC;
}

/** "a, #b  c" -> ["a", "b", "c"]: letters, digits and underscores only, no repeats. */
export function parseHashtagList(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    const t = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  }
  return out;
}
