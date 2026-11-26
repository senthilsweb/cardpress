// Builds the user guide as plain static pages for the web. No dependencies. (Inside the app the same pages are shown by
// web/src/components/help/Help.tsx.)
//   node guide/build.mjs <output folder>
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS, PAGES, searchIndex, sections } from "./content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const readPage = (slug) => readFileSync(join(here, "pages", `${slug}.html`), "utf8");
// the first page is the guide's front page
const href = (slug) => (slug === PAGES[0][0] ? "index.html" : `${slug}.html`);
const links = (html) => html.replace(/href="([a-z]+)\.html(#[a-z0-9-]+)?"/g, (_, slug, anchor) => `href="${href(slug)}${anchor ?? ""}"`);

function page(i) {
  const [slug, title] = PAGES[i];
  const { body, found } = sections(readPage(slug));
  const nav = GROUPS.map((g) => `<p>${g.name}</p>\n${g.pages.map(([s, t]) => `<a href="${href(s)}"${s === slug ? ' aria-current="page"' : ""}>${t}</a>`).join("\n")}`).join("\n");
  const toc = found.length > 1 ? `<aside><p>On this page</p>${found.map((h) => `<a href="#${h.id}">${h.text}</a>`).join("")}</aside>` : "<aside></aside>";
  const step = (j, label, cls) => (PAGES[j] ? `<a class="${cls}" href="${href(PAGES[j][0])}"><small>${label}</small>${PAGES[j][1]}</a>` : "<span></span>");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · CardPress Guide</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<header>
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
${links(body)}
<div class="steps">${step(i - 1, "Previous", "prev")}${step(i + 1, "Next", "next")}</div>
</main>
${toc}
</div>
<script src="search-index.js"></script>
<script src="guide.js"></script>
</body>
</html>
`;
}

export function build(out) {
  mkdirSync(join(out, "img"), { recursive: true });
  PAGES.forEach(([slug], i) => writeFileSync(join(out, href(slug)), page(i)));
  const index = searchIndex(readPage).map((e) => ({ u: href(e.slug) + (e.anchor ? `#${e.anchor}` : ""), p: e.p, h: e.h, t: e.t }));
  writeFileSync(join(out, "search-index.js"), `window.GUIDE=${JSON.stringify(index)};\n`);
  for (const f of ["style.css", "guide.js"]) copyFileSync(join(here, f), join(out, f));
  for (const f of readdirSync(join(here, "img"))) copyFileSync(join(here, "img", f), join(out, "img", f));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out] = process.argv.slice(2);
  if (out) build(resolve(out));
  else { console.error("usage: node guide/build.mjs <output folder>"); process.exit(1); }
}
