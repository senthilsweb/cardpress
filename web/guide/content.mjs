// What the guide contains. Used by the page inside the app and by the web build, so it must not touch files or the page.

/** The pages in reading order, under their headings. A page is `pages/<slug>.html`: its contents only. */
export const GROUPS = [
  { name: "Basics", pages: [["start", "Getting started"], ["brands", "Brands and multiple accounts"], ["social", "Connect social accounts"]] },
  { name: "Create", pages: [["posts", "LinkedIn posts"], ["articles", "LinkedIn articles"], ["together", "Posts and articles together"], ["greetings", "Seasonal greetings"], ["chat", "Design with chat"], ["card", "The card"], ["backgrounds", "Backgrounds"]] },
  { name: "Publish and manage", pages: [["publish", "Publish and schedule"], ["library", "Library"], ["calendar", "Calendar"]] },
  { name: "Reference", pages: [["accounts", "Sign in and roles"], ["problems", "Common problems"]] },
];
export const PAGES = GROUPS.flatMap((g) => g.pages);

const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const slugify = (text) => plain(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Gives each section heading an id, and lists them for "On this page". */
export function sections(html) {
  const found = [];
  const body = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, text) => {
    const id = slugify(text);
    found.push({ id, text: plain(text) });
    return `<h2 id="${id}">${text}</h2>`;
  });
  return { body, found };
}

/** What the search looks through: one entry per section of each page. `read(slug)` gives a page's contents. */
export function searchIndex(read) {
  return PAGES.flatMap(([slug, title]) => {
    const parts = sections(read(slug)).body.split(/(?=<h2 id=")/);
    return parts.map((part) => {
      const m = /^<h2 id="([^"]+)">([\s\S]*?)<\/h2>/.exec(part);
      return { slug, anchor: m ? m[1] : "", p: title, h: m ? plain(m[2]) : "", t: plain(m ? part.slice(m[0].length) : part) };
    });
  }).filter((e) => e.t);
}

/** The best matches for what was typed: every word must appear; a match in a heading comes first. */
export function search(index, query, most = 8) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return index
    .map((e) => {
      const head = `${e.p} ${e.h}`.toLowerCase(), all = `${head} ${e.t.toLowerCase()}`;
      return words.every((w) => all.includes(w)) ? { e, rank: words.filter((w) => head.includes(w)).length } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, most)
    .map(({ e }) => {
      const at = Math.max(0, e.t.toLowerCase().indexOf(words[0]) - 30);
      return { ...e, snippet: `${at ? "…" : ""}${e.t.slice(at, at + 90)}…` };
    });
}
