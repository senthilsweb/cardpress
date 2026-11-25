import type { Draft } from "./draft";
import { serializeDraft } from "./linkedin";

export const shortLabel = (text: string) => (text.split("\n")[0] || "Empty draft").slice(0, 34);

// A draft's label only changes when its document does, and the store keeps untouched documents as the same object, so
// every draft but the one being typed in is served from here instead of being serialised again on each keystroke.
export const labelCache = new WeakMap<object, string>();
export const labelOf = (d: Draft) => {
  let l = labelCache.get(d.doc);
  if (l === undefined) { l = shortLabel(serializeDraft(d).text); labelCache.set(d.doc, l); }
  return l;
};
