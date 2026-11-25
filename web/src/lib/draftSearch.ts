import type { Draft, DraftKind } from "./draft";
import { serializeDraft } from "./linkedin";

// the text of a document that has not changed is worked out once
const textCache = new WeakMap<object, string>();
const textOf = (d: Draft) => {
  let t = textCache.get(d.doc);
  if (t === undefined) { t = serializeDraft(d).text; textCache.set(d.doc, t); }
  return t;
};

/** What an item is called in a list: its title if it has one, else its first line. The list cuts it to fit. */
export const draftName = (d: Draft) => d.title?.trim() || textOf(d).split("\n")[0].slice(0, 160) || "Empty draft";

/**
 * The items that match what was typed, newest first. Every word must appear in the name, the text or a hashtag; items
 * whose name holds every word come before those that only mention them.
 */
export function searchDrafts(drafts: Draft[], query: string, kind: DraftKind | "all" = "all"): Draft[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const newest = drafts.filter((d) => kind === "all" || d.kind === kind).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  if (!words.length) return newest;
  const named: Draft[] = [], mentioned: Draft[] = [];
  for (const d of newest) {
    const name = draftName(d).toLowerCase();
    if (words.every((w) => name.includes(w))) { named.push(d); continue; }
    const all = `${name}\n${textOf(d).toLowerCase()}\n${d.hashtags.map((h) => `#${h}`).join(" ").toLowerCase()}`;
    if (words.every((w) => all.includes(w))) mentioned.push(d);
  }
  return [...named, ...mentioned];
}
