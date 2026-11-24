/** Pure helpers for the large article editor: the "/" menu, the outline and the counts in the footer. */

export type SlashId = "h1" | "h2" | "picture" | "table" | "codeBlock" | "quote" | "divider" | "bullets" | "numbers";

export interface SlashCommand { id: SlashId; label: string; /** extra words that also find it */ words: string }

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "h1", label: "Heading", words: "title h1 header" },
  { id: "h2", label: "Subheading", words: "h2 h3 section" },
  { id: "picture", label: "Picture", words: "image photo" },
  { id: "table", label: "Table", words: "grid rows" },
  { id: "codeBlock", label: "Code block", words: "code snippet pre" },
  { id: "quote", label: "Quote", words: "blockquote cite" },
  { id: "divider", label: "Divider", words: "line rule hr break" },
  { id: "bullets", label: "Bulleted list", words: "list ul points" },
  { id: "numbers", label: "Numbered list", words: "list ol steps" },
];

/** Commands whose name (or a keyword) starts with the typed text, name matches first. */
export function filterCommands(query: string, all: SlashCommand[] = SLASH_COMMANDS): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  const byName = all.filter((c) => c.label.toLowerCase().split(" ").some((w) => w.startsWith(q)));
  const byWord = all.filter((c) => !byName.includes(c) && c.words.split(" ").some((w) => w.startsWith(q)));
  return [...byName, ...byWord];
}

/** The text after "/" when a paragraph holds only a slash command being typed; null when the menu should not show. */
export function slashQuery(paragraphText: string): string | null {
  const m = /^\/([\p{L}\d ]{0,20})$/u.exec(paragraphText);
  return m ? m[1] : null;
}

export interface OutlineItem { level: 1 | 2 | 3; text: string; pos: number }

interface WalkNode { type: { name: string }; attrs: Record<string, unknown>; textContent: string }
/** Anything shaped like a ProseMirror document, so the walk can be tested without an editor. */
export interface Walkable { descendants: (f: (node: WalkNode, pos: number) => boolean | void) => void }

/** Headings H1 to H3 in reading order, with the position to jump to. Empty headings are left out. */
export function outlineOf(doc: Walkable): OutlineItem[] {
  const items: OutlineItem[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = Number(node.attrs.level);
    const text = node.textContent.trim();
    if (text && level >= 1 && level <= 3) items.push({ level: level as 1 | 2 | 3, text, pos });
    return false;
  });
  return items;
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/** Minutes to read at a calm 200 words a minute; at least 1 when there is any text. */
export function readingMinutes(words: number): number {
  return words <= 0 ? 0 : Math.max(1, Math.round(words / 200));
}

export type TextWidth = "narrow" | "wide";
export const TEXT_SIZES = [0.9375, 1.0625, 1.1875, 1.3125] as const;
export const DEFAULT_SIZE_INDEX = 1;

/** One step up or down the size list, never past either end. */
export function stepSize(index: number, delta: 1 | -1): number {
  return Math.min(TEXT_SIZES.length - 1, Math.max(0, index + delta));
}

/** A saved choice read back safely: anything unexpected falls back to the default. */
export function parseWidth(raw: string | null): TextWidth { return raw === "wide" ? "wide" : "narrow"; }
export function parseSizeIndex(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 0 && n < TEXT_SIZES.length ? n : DEFAULT_SIZE_INDEX;
}
