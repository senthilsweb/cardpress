#!/usr/bin/env node
// Loads posts and articles from a folder of Markdown into a running CardPress, through its API, so the library, the editor
// and the approval flow can be tried with real writing. Nothing is copied into this repository.
//
//   node import.mjs --register ~/path/to/folder --server http://127.0.0.1:8080 [--brand personal] [--posts 10] [--articles 6]
//                   [--approve-every 3] [--dry-run]
//
// It reads only `linkedin-posts/<slug>/post.md` and `article-drafts/<slug>/<slug>.md` (and the pictures an article names,
// from its own folder). Everything arrives as a draft; every Nth one is approved. Nothing is scheduled or sent, and it
// refuses to run against a server that has LinkedIn credentials for the brand.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { markdownToDoc, plainToDoc } from "./md-to-doc.mjs";

/* ------------------------------------------------------------------ options */
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback; };
const flag = (name) => argv.includes(`--${name}`);
if (flag("help") || flag("h")) {
  console.log("usage: node import.mjs --register <folder> --server <url> [--brand <id>] [--posts N] [--articles N] [--approve-every N] [--dry-run]");
  process.exit(0);
}
const home = (p) => (p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p);
const register = path.resolve(home(opt("register", process.env.REGISTER_DIR ?? "")));
const server = opt("server", "http://127.0.0.1:8080").replace(/\/$/, "");
const wantPosts = Number(opt("posts", 10)), wantArticles = Number(opt("articles", 6));
const approveEvery = Number(opt("approve-every", 3));
const dryRun = flag("dry-run");
const token = opt("token", process.env.CARDPRESS_API_TOKEN ?? "");
if (!process.env.REGISTER_DIR && !argv.includes("--register")) { console.error("Say which folder to read: --register <folder>"); process.exit(2); }

const api = async (method, p, body) => {
  const res = await fetch(`${server}/api/v1${p}`, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${raw.slice(0, 300)}`);
  return raw ? JSON.parse(raw) : null;
};

/* ------------------------------------------------------------------ reading: only the two folders */
const roots = { posts: path.join(register, "linkedin-posts"), articles: path.join(register, "article-drafts") };
const inside = (root, file) => { const r = path.resolve(file); return r === root || r.startsWith(root + path.sep); };
const readText = async (root, file) => { if (!inside(root, file)) throw new Error(`refusing to read outside ${root}`); return fs.readFile(file, "utf8"); };
const subdirs = async (root) => (await fs.readdir(root, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name).sort();

function frontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    else v = v.replace(/^["']|["']$/g, "");
    meta[kv[1]] = v;
  }
  return { meta, body: md.slice(m[0].length) };
}

const HASHTAG = /^[\p{L}\p{N}_]{1,100}$/u;
function splitHashtags(body) {
  const lines = body.trimEnd().split("\n");
  const tags = [];
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (!last) { lines.pop(); continue; }
    const words = last.split(/\s+/);
    if (words.every((w) => w.startsWith("#") && HASHTAG.test(w.slice(1)))) { tags.unshift(...words.map((w) => w.slice(1))); lines.pop(); } else break;
  }
  return { body: lines.join("\n").trim(), hashtags: [...new Set(tags)].slice(0, 30) };
}

/** A post: the first variant's text, its closing hashtags, and the headline to put on the card. */
function parsePost(md) {
  const lines = md.split("\n");
  const h1 = (lines.find((l) => /^# /.test(l)) ?? "").replace(/^# /, "").trim();
  const headline = ((md.match(/\*\*Post title \(headline\):\*\*\s*(.+)/)?.[1] ?? h1).replace(/\s*\([^)]*\)\s*$/, "")).trim();
  const vi = lines.findIndex((l) => /^## Variant\b/i.test(l));
  if (vi < 0) return null;
  let end = lines.findIndex((l, i) => i > vi && (/^---\s*$/.test(l) || /^## /.test(l)));
  if (end < 0) end = lines.length;
  const { body, hashtags } = splitHashtags(lines.slice(vi + 1, end).join("\n").trim());
  return body.length >= 40 ? { headline: headline || h1, body, hashtags } : null;
}

/* ------------------------------------------------------------------ pictures */
let sharp = null;
try { sharp = (await import("sharp")).default; } catch { /* without sharp a picture is kept only if it is already small */ }
const MAX_PICTURE = 1.5 * 1024 * 1024, DOC_BUDGET = 20 * 1024 * 1024;

function pictureReader(dir, state) {
  return async (href, alt) => {
    if (/^[a-z]+:/i.test(href)) return null; // a web address: leave it out
    const file = path.resolve(dir, decodeURIComponent(href));
    if (!inside(dir, file)) return null;
    let buf;
    try { buf = await fs.readFile(file); } catch { state.skipped++; return null; }
    const ext = path.extname(file).toLowerCase();
    let mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : null;
    if (!mime) { state.skipped++; return null; }
    if (sharp) {
      const img = sharp(buf, { failOn: "none" });
      const meta = await img.metadata();
      const resized = Math.max(meta.width ?? 0, meta.height ?? 0) > 1600 ? img.resize({ width: 1600, height: 1600, fit: "inside" }) : img;
      let out = mime === "image/png" ? await resized.png({ compressionLevel: 9 }).toBuffer() : await resized.jpeg({ quality: 86 }).toBuffer();
      if (mime === "image/png" && out.length > MAX_PICTURE) { out = await sharp(buf, { failOn: "none" }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer(); mime = "image/jpeg"; }
      buf = out;
    } else if (buf.length > MAX_PICTURE) { state.skipped++; return null; }
    if (state.bytes + buf.length * 1.34 > DOC_BUDGET) { state.skipped++; return null; }
    state.bytes += buf.length * 1.34;
    state.embedded++;
    return { type: "image", attrs: { src: `data:${mime};base64,${buf.toString("base64")}`, alt: alt || path.basename(file, ext) } };
  };
}

/* ------------------------------------------------------------------ designs: the editor's own catalogue, varied */
const LAYOUTS = ["hero", "center", "split", "quote"];
const BACKGROUNDS = ["constellation", "dots", "code", "bars", "geometric", "contours", "mesh", "plain"];
const COVERS = ["cream-emerald", "deep-navy-cyan-violet", "blue-pink-gloss", "dark-neon-pink-blue", "privacy-orange-coral", "light-blue-purple", "charcoal-gold-teal", "soft-slate-copper"];
const seedOf = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1000, 7);
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…");
const firstSentence = (s) => cut((s.replace(/\s+/g, " ").match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim(), 120);

function designFor(i, { slug, title, subtitle, eyebrow, article, palettes }) {
  const paletteId = palettes[i % palettes.length]; // each item gets a different colour set from the editor's own
  return {
    sizeId: "li-post",
    layout: article ? "cover" : LAYOUTS[i % LAYOUTS.length],
    background: BACKGROUNDS[(i * 3 + (article ? 1 : 0)) % BACKGROUNDS.length],
    paletteId, seed: seedOf(slug),
    eyebrow: cut(eyebrow, 60), title: cut(title, 90), subtitle, footer: "", tag: "", quoteAuthor: "", statValue: "",
    titleScale: title.length > 70 ? 0.8 : 1, intensity: 0.9, bottomFade: 0, showLogo: true, showFooter: true, photos: [],
  };
}

const pick = (all, n) => (n >= all.length ? all : Array.from({ length: n }, (_, k) => all[Math.floor((k * all.length) / n)]));

/* ------------------------------------------------------------------ run */
async function main() {
  for (const [k, r] of Object.entries(roots)) if (!(await fs.stat(r).catch(() => null))) { console.error(`No ${path.basename(r)} folder in ${register}`); process.exit(2); }

  const state = await api("GET", "/state");
  const brand = opt("brand", state.preferences?.activeProfile ?? state.profiles?.[0]?.id ?? "personal");
  const palettes = (state.profiles.find((p) => p.id === brand)?.palettes ?? []).map((p) => p.id).filter((id) => COVERS.includes(id));
  const usable = palettes.length ? COVERS.filter((c) => palettes.includes(c)) : COVERS;

  // never load a test set into a server that can publish
  const settings = await api("GET", `/profiles/${encodeURIComponent(brand)}/settings`).catch(() => null);
  const li = settings?.networks?.find((n) => n.id === "linkedin");
  if (li?.fields?.some((f) => f.set && (f.key === "accessToken" || f.key === "authorUrn"))) {
    console.error(`Refusing: ${server} has LinkedIn credentials for "${brand}". Import into a server without them (an empty database is best).`);
    process.exit(3);
  }
  const have = new Set(((await api("GET", `/library?profileId=${encodeURIComponent(brand)}&pageSize=50`)).items ?? []).map((x) => `${x.kind}:${x.title}`));

  const items = [];
  let i = 0;
  for (const slug of pick(await subdirs(roots.posts), 200)) {
    const dir = path.join(roots.posts, slug);
    const md = await readText(roots.posts, path.join(dir, "post.md")).catch(() => null);
    const p = md && parsePost(md);
    if (p) items.push({ kind: "post", slug, dir, ...p });
  }
  const posts = pick(items, wantPosts);
  const articleList = [];
  for (const slug of await subdirs(roots.articles)) {
    const dir = path.join(roots.articles, slug);
    const md = await readText(roots.articles, path.join(dir, `${slug}.md`)).catch(() => null);
    if (md) articleList.push({ slug, dir, md });
  }
  const articles = pick(articleList, wantArticles);
  console.log(`Found ${items.length} posts and ${articleList.length} articles; importing ${posts.length} and ${articles.length} into "${brand}"${dryRun ? " (dry run)" : ""}.`);

  let made = 0, approved = 0, skipped = 0;
  const send = async (label, body, n) => {
    if (dryRun) { console.log(`  would add ${label}`); return; }
    const d = await api("POST", "/drafts", body);
    made++;
    if (approveEvery > 0 && n % approveEvery === 0) { await api("POST", `/drafts/${d.id}/approve`); approved++; }
    console.log(`  added ${label}`);
  };

  for (const p of posts) {
    const title = p.body.split("\n")[0].slice(0, 80);
    if (have.has(`post:${title}`)) { skipped++; continue; }
    const design = designFor(i, { slug: p.slug, title: p.headline, subtitle: firstSentence(p.body.split("\n\n")[1] ?? p.body), eyebrow: p.hashtags.slice(0, 2).join(" · "), article: false, palettes: usable });
    await send(`post  ${p.slug} (${design.layout}, ${design.background}, ${design.paletteId})`,
      { profileId: brand, kind: "post", doc: plainToDoc(p.body), hashtags: p.hashtags, altText: "", unicodeStyles: false, design }, i++);
  }
  for (const a of articles) {
    const { meta, body } = frontMatter(a.md);
    const title = String(meta.title ?? body.match(/^# (.+)$/m)?.[1] ?? a.slug).trim();
    if (have.has(`article:${title}`)) { skipped++; continue; }
    const pics = { bytes: 0, embedded: 0, skipped: 0 };
    const doc = await markdownToDoc(body, { image: pictureReader(a.dir, pics) });
    const design = designFor(i, { slug: a.slug, title, subtitle: cut(String(meta.description ?? ""), 150), eyebrow: String(meta.category ?? "Article"), article: true, palettes: usable });
    await send(`article ${a.slug} (${pics.embedded} pictures embedded${pics.skipped ? `, ${pics.skipped} left out` : ""}, ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB)`,
      { profileId: brand, kind: "article", title, doc, hashtags: [], altText: "", unicodeStyles: false, design }, i++);
  }
  console.log(`Done: ${made} added, ${approved} approved, ${skipped} already there.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
