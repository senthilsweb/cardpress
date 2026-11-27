/** One line of a drop-down. */
export interface Option { value: string; label: string; /** Other names it is found by. */ words?: string }

const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[_/]+/g, " ");

/** The lines holding every word typed, whatever the accents, case, or the "_" and "/" of a time zone. Those that start with it come first. */
export function findOptions(options: Option[], query: string): Option[] {
  const q = plain(query).trim();
  if (!q) return options;
  const words = q.split(/\s+/);
  const found = options.filter((o) => { const text = plain(`${o.label} ${o.words ?? ""}`); return words.every((w) => text.includes(w)); });
  return [...found.filter((o) => plain(o.label).startsWith(q)), ...found.filter((o) => !plain(o.label).startsWith(q))];
}
