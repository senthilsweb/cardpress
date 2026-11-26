import { BACKGROUNDS, categoryOf, CATEGORIES } from "./backgrounds";
import type { BackgroundDef } from "./bgkit";

/** What the picker's left list selects: everything, a category, or one group in it. */
export interface Scope { category?: string; group?: string }

export interface Section { category: string; group: string; items: BackgroundDef[] }

const words = (b: BackgroundDef) => [b.name, b.hint, b.group, categoryOf(b), ...(b.keywords ?? [])].join(" ").toLowerCase();

/**
 * The backgrounds to show, under their headings. A search covers everything, whatever the left list has selected; every
 * word typed must appear.
 */
export function findBackgrounds(query: string, scope: Scope = {}): Section[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: Section[] = [];
  for (const category of CATEGORIES) {
    for (const b of BACKGROUNDS) {
      if (categoryOf(b) !== category) continue;
      const group = b.group ?? "";
      if (terms.length) {
        const text = words(b);
        if (!terms.every((t) => text.includes(t))) continue;
      } else if ((scope.category && scope.category !== category) || (scope.group && scope.group !== group)) continue;
      let s = out.find((x) => x.category === category && x.group === group);
      if (!s) out.push((s = { category, group, items: [] }));
      s.items.push(b);
    }
  }
  return out;
}
