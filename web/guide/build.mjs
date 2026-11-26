// Builds the user guide as plain static pages. No dependencies.
//   node guide/build.mjs quick                 the one-page guide inside the app (public/help/)
//   node guide/build.mjs full <output folder>  the full guide for the web
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const FULL_URL = "https://www.senthilsweb.com/cardpress/guide/";

/** The pages of the full guide, in reading order. A page is `pages/<slug>.html`: its contents only. */
export const PAGES = [
  ["index", "Start here"],
  ["accounts", "Sign in and accounts"],
  ["brands", "Brands"],
  ["social", "Connect social accounts"],
  ["card", "Create a card"],
  ["chat", "Write with chat"],
  ["backgrounds", "Backgrounds and greetings"],
  ["publish", "Publish and schedule"],
  ["library", "Library"],
  ["calendar", "Calendar"],
  ["problems", "Common problems"],
];

const read = (...p) => readFileSync(join(here, ...p), "utf8");
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const slugify = (text) => plain(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Gives each section heading an id, and lists them for "On this page". */
export function sections(html) {
  const found = [];
  const body = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, text) => {
    const id = slugify(text);
    found.push({ id, text });
    return `<h2 id="${id}">${text}</h2>`;
  });
  return { body, found };
}

const href = (slug) => `${slug}.html`;
const shell = (title, head, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${head}
</head>
<body>
${body}
</body>
</html>
`;

function page(i) {
  const [slug, title] = PAGES[i];
  const { body, found } = sections(read("pages", `${slug}.html`));
  const nav = PAGES.map(([s, t]) => `<a href="${href(s)}"${s === slug ? ' aria-current="page"' : ""}>${t}</a>`).join("\n");
  const toc = found.length > 1 ? `<aside><p>On this page</p>${found.map((h) => `<a href="#${h.id}">${h.text}</a>`).join("")}</aside>` : "<aside></aside>";
  const step = (j, label, cls) => (PAGES[j] ? `<a class="${cls}" href="${href(PAGES[j][0])}"><small>${label}</small>${PAGES[j][1]}</a>` : "<span></span>");
  return shell(`${title} · CardPress Guide`, '<link rel="stylesheet" href="style.css">', `<header>
<button id="menu" type="button" aria-label="Contents" aria-expanded="false">☰</button>
<a class="name" href="index.html">CardPress Guide</a>
<div class="search"><input id="q" type="search" placeholder="Search" aria-label="Search the guide" autocomplete="off"><div id="hits" hidden></div></div>
</header>
<div class="layout">
<nav id="contents" aria-label="Contents">
${nav}
</nav>
<main>
<h1>${title}</h1>
${body}
<div class="steps">${step(i - 1, "Previous", "prev")}${step(i + 1, "Next", "next")}</div>
</main>
${toc}
</div>
<script src="search-index.js"></script>
<script src="guide.js"></script>`);
}

/** What the search looks through: one entry per section of each page. */
export function searchIndex() {
  return PAGES.flatMap(([slug, title]) => {
    const { body } = sections(read("pages", `${slug}.html`));
    const parts = body.split(/(?=<h2 id=")/);
    return parts.map((part) => {
      const m = /^<h2 id="([^"]+)">([\s\S]*?)<\/h2>/.exec(part);
      return { u: href(slug) + (m ? `#${m[1]}` : ""), p: title, h: m ? plain(m[2]) : "", t: plain(m ? part.slice(m[0].length) : part) };
    });
  }).filter((e) => e.t);
}

export function buildFull(out) {
  mkdirSync(join(out, "img"), { recursive: true });
  PAGES.forEach(([slug], i) => writeFileSync(join(out, href(slug)), page(i)));
  writeFileSync(join(out, "search-index.js"), `window.GUIDE=${JSON.stringify(searchIndex())};\n`);
  for (const f of ["style.css", "guide.js"]) copyFileSync(join(here, f), join(out, f));
  for (const f of readdirSync(join(here, "img"))) copyFileSync(join(here, "img", f), join(out, "img", f));
}

/** One self-contained page. */
export function buildQuick(out) {
  mkdirSync(out, { recursive: true });
  const body = read("quick.html").replaceAll("{{FULL}}", FULL_URL);
  writeFileSync(join(out, "index.html"), shell("CardPress quick guide", `<style>\n${read("style.css")}</style>`, `<main class="quick">\n${body}</main>`));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [what, out] = process.argv.slice(2);
  if (what === "quick") buildQuick(resolve(out ?? join(here, "..", "public", "help")));
  else if (what === "full" && out) buildFull(resolve(out));
  else { console.error("usage: node guide/build.mjs quick | full <folder>"); process.exit(1); }
}
