// Records the marketing demo from a running CardPress.
//   node record.mjs video   -> out/demo.webm  (needs Playwright's ffmpeg: npx playwright install ffmpeg)
//   node record.mjs gif     -> out/demo.gif   (for the README and social posts)
// Env: BASE (default http://127.0.0.1:18300), SOURCE_FILE (the article text pasted into the assistant)
import { chromium } from "playwright-core";
import gifenc from "gifenc";
import pngjs from "pngjs";
const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;
import fs from "node:fs";
import path from "node:path";

const MODE = process.argv[2] || "video";
const BASE = (process.env.BASE || "http://127.0.0.1:18300").replace(/\/$/, "");
const SOURCE = fs.readFileSync(process.env.SOURCE_FILE || new URL("./source.txt", import.meta.url), "utf8").trim();
const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const W = 1440, H = 860, GW = 880, GH = Math.round((H * GW) / W);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  colorScheme: "light",
  ...(MODE === "video" ? { recordVideo: { dir: OUT + "tmp", size: { width: W, height: H } } } : {}),
});
await ctx.addInitScript(() => {
  // a visible cursor and click ripple, so the recording reads as a person using the app
  const mount = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText = "position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))";
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9-6.5 1.6L9.4 19z" fill="#0a3b33" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    window.__cur = (x, y, ms) => { c.style.transition = ms ? `transform ${ms}ms cubic-bezier(.4,.1,.2,1)` : "none"; c.style.transform = `translate(${x}px,${y}px)`; window.__pos = [x, y]; };
    window.__ripple = () => {
      const [x, y] = window.__pos || [0, 0];
      const r = document.createElement("div");
      r.style.cssText = `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;border:3px solid #f5b301;z-index:2147483646;pointer-events:none;opacity:.9;transition:transform .45s ease-out,opacity .45s ease-out`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(2.1)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
});
const page = await ctx.newPage();

// ---- frame capture (gif mode) ----
const frames = [];
function resize(png) {
  const out = new Uint8Array(GW * GH * 4), sx = png.width / GW, sy = png.height / GH;
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let yy = Math.floor(y * sy); yy < Math.min(png.height, Math.ceil((y + 1) * sy)); yy++)
      for (let xx = Math.floor(x * sx); xx < Math.min(png.width, Math.ceil((x + 1) * sx)); xx++) { const i = (yy * png.width + xx) * 4; r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++; }
    const o = (y * GW + x) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return out;
}
async function snap(delay) {
  const png = PNG.sync.read(await page.screenshot({ type: "png" }));
  frames.push({ rgba: resize(png), delay });
}
// hold: stay on the current view for ms. animated: sample frames while something moves.
async function hold(ms, animated = false) {
  if (MODE === "video") return page.waitForTimeout(ms);
  if (!animated || ms < 200) return snap(ms);
  const step = 130;
  for (let t = 0; t < ms; t += step) { await page.waitForTimeout(40); await snap(step); }
}

// ---- helpers ----
let cur = [W / 2, H / 2];
async function moveTo(x, y) {
  if (MODE === "video") { await page.evaluate(([x, y]) => window.__cur(x, y, 650), [x, y]); await page.waitForTimeout(700); }
  else {
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const t = i / n, e = t * t * (3 - 2 * t);
      await page.evaluate(([x, y]) => window.__cur(x, y, 0), [cur[0] + (x - cur[0]) * e, cur[1] + (y - cur[1]) * e]);
      await snap(70);
    }
  }
  cur = [x, y];
}
async function click(loc, { after = 700, animated = true } = {}) {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await loc.boundingBox();
  await moveTo(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.evaluate(() => window.__ripple());
  await loc.click();
  await page.mouse.move(W - 3, H - 3); // park the real pointer so no tooltip or hover state lingers in the frame
  await hold(after, animated);
}
async function type(loc, text, { clear = false } = {}) {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await loc.boundingBox();
  await moveTo(bb.x + Math.min(bb.width - 12, 60), bb.y + bb.height / 2);
  await loc.click();
  if (clear) { await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.press("Backspace"); }
  if (MODE === "video") { await page.keyboard.type(text, { delay: 32 }); await page.waitForTimeout(500); return; }
  for (let i = 0; i < text.length; i += 4) { await page.keyboard.type(text.slice(i, i + 4)); await snap(90); }
  await hold(500);
}
// open or fold a sidebar section, whatever state it is in
async function section(name, open) {
  const h = page.getByRole("button", { name, exact: true }).first();
  if ((await h.getAttribute("aria-expanded")) !== String(open)) await click(h, { after: 450 });
}
const btn = (name, opts = {}) => page.getByRole("button", { name, exact: opts.exact ?? false }).first();

// ---- the story ----
await page.goto(BASE + "/studio/");
await page.waitForLoadState("networkidle");
await moveTo(W * 0.62, H * 0.5);
await page.getByRole("tab", { name: "Design" }).waitFor();
await page.waitForTimeout(600);
await hold(1200);

// Design: layout, background, colours
for (const n of ["Layout", "Background", "Colours"]) await section(n, false);
await hold(600);
await section("Layout", true);
await click(btn("Article cover"));
await hold(500);
await section("Layout", false);
await section("Background", true);
await click(btn("Gradient mesh"));
await section("Background", false);
await section("Colours", true);
await click(btn("Deep navy cyan violet", { exact: true }));
await hold(600);
await click(btn("Charcoal gold teal", { exact: true }));
await hold(900);
await click(btn("Shuffle", { exact: true }).first());
await hold(900);

// Assistant: paste an article, get a draft, approve
await page.evaluate(() => window.__cur && window.__cur(0, 0, 0));
await click(page.getByRole("button", { name: "Assistant", exact: true }), { after: 900 });
const src = page.locator("#chat-text");
await src.evaluate((el) => el.scrollIntoView({ block: "center" }));
const sb = await src.boundingBox();
await moveTo(sb.x + 80, sb.y + 40);
await src.click();
await src.fill(SOURCE);
await hold(1400);
await click(btn("Draft from this"), { after: 300 });
await page.getByRole("button", { name: "Approve and use" }).waitFor({ timeout: 20000 });
await hold(1600);
await click(btn("Approve and use"), { after: 1200 });
await click(page.getByRole("button", { name: /Open the Post tab/ }), { after: 1000 });

// Text: refine the card copy
await click(page.getByRole("tab", { name: "Text" }), { after: 600 });
await type(page.locator("#tag"), "Part 1 · Data pipeline", { clear: true });
await type(page.locator("#eyebrow"), "Bank statements", { clear: true });
await type(page.locator("#title"), "From bank statements to cash-flow insight", { clear: true });
await type(page.locator("#subtitle"), "Ingest. Parse. Categorise. Summarise.", { clear: true });
await type(page.locator("#footerl"), "senthilsweb.com", { clear: true });
await type(page.locator("#footer"), "github.com/senthilsweb/cardpress", { clear: true });
await hold(900);

// Post: the writing view
await click(page.getByRole("tab", { name: "Post" }), { after: 900 });
const tag = page.getByLabel("Add a hashtag");
await tag.evaluate((el) => el.scrollIntoView({ block: "center" }));
// the demo agent suggests a few tags; clear them and add our own
for (let n = await page.getByRole("button", { name: /^Remove #/ }).count(); n > 0; n--) await click(page.getByRole("button", { name: /^Remove #/ }).first(), { after: 250 });
for (const t of ["DataEngineering", "CashFlow", "Fintech"]) {
  await type(tag, t);
  await page.keyboard.press("Enter");
  await hold(500, true);
}
await click(page.getByRole("button", { name: /Full preview/ }).first(), { after: 2600 });
await page.keyboard.press("Escape");
await hold(800);

// Sizes for every network
await click(page.getByRole("tab", { name: "Design" }), { after: 500 });
await click(page.getByRole("button", { name: "Square", exact: true }).nth(2), { after: 1300 });
await click(page.getByRole("button", { name: "Story", exact: true }), { after: 1300 });
await click(page.getByRole("button", { name: "All sizes", exact: true }), { after: 2200 });
await click(page.getByRole("button", { name: "One", exact: true }), { after: 400 });
await click(page.getByRole("button", { name: "Post image", exact: true }).first(), { after: 1000 });

// Dark and light
await click(page.getByRole("button", { name: "Toggle theme" }), { after: 1600 });
await click(page.getByRole("button", { name: "Toggle theme" }), { after: 1800 });

if (MODE === "video") {
  const video = page.video();
  await ctx.close();
  fs.renameSync(await video.path(), OUT + "demo.webm");
  fs.rmSync(OUT + "tmp", { recursive: true, force: true });
  console.log("wrote out/demo.webm", (fs.statSync(OUT + "demo.webm").size / 1e6).toFixed(1) + " MB");
} else {
  await ctx.close();
  // one shared palette for the whole animation, sampled across the frames
  const sample = new Uint8Array(Math.min(frames.length, 40) * 4096 * 4);
  const every = Math.max(1, Math.floor(frames.length / 40));
  let o = 0;
  for (let f = 0; f < frames.length && o + 16384 <= sample.length; f += every) {
    const a = frames[f].rgba, stride = Math.floor(a.length / 16384) & ~3 || 4;
    for (let i = 0; i < 4096; i++) { sample.set(a.subarray(i * stride, i * stride + 4), o + i * 4); }
    o += 16384;
  }
  const palette = quantize(sample, 255);
  palette.push([0, 0, 0]); // index 255 is transparent: pixels that did not change since the last frame
  const enc = GIFEncoder();
  let prev = null;
  frames.forEach((f, i) => {
    const idx = applyPalette(f.rgba, palette.slice(0, 255));
    if (prev) for (let px = 0; px < idx.length; px++) {
      const o = px * 4;
      if (f.rgba[o] === prev[o] && f.rgba[o + 1] === prev[o + 1] && f.rgba[o + 2] === prev[o + 2]) idx[px] = 255;
    }
    prev = f.rgba;
    enc.writeFrame(idx, GW, GH, { palette: i === 0 ? palette : undefined, delay: f.delay, repeat: 0, transparent: i > 0, transparentIndex: 255, dispose: 1 });
  });
  if (process.env.DUMP) {
    fs.mkdirSync(OUT + "frames", { recursive: true });
    frames.forEach((f, i) => { if (i % Number(process.env.DUMP) === 0) { const png = new PNG({ width: GW, height: GH }); png.data = Buffer.from(f.rgba); fs.writeFileSync(`${OUT}frames/${String(i).padStart(4, "0")}.png`, PNG.sync.write(png)); } });
  }
  enc.finish();
  fs.writeFileSync(OUT + "demo.gif", enc.bytes());
  console.log("wrote out/demo.gif", frames.length, "frames", (enc.bytes().length / 1e6).toFixed(1) + " MB");
}
await browser.close();
