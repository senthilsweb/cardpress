// Records the marketing demo GIF from a running CardPress, the same way every time:
// a fixed script, a fixed design seed (the app's default), a seeded Math.random, explicit frame delays and no real-time
// dependence in the output. Run it through ./run.sh, which starts CardPress on an empty database.
// Env: BASE (default http://127.0.0.1:18300), SOURCE_FILE (the article text pasted into the assistant), DUMP=n (also
// write every nth frame to out/frames for review)
import { chromium } from "playwright-core";
import gifenc from "gifenc";
import pngjs from "pngjs";
const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const BASE = (process.env.BASE || "http://127.0.0.1:18300").replace(/\/$/, "");
const SOURCE = fs.readFileSync(process.env.SOURCE_FILE || new URL("./source.txt", import.meta.url), "utf8").trim();
const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const W = 1440, H = 860, GW = 1200, GH = Math.round((H * GW) / W);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2, // capture at 2x and scale down, so text and card edges stay sharp
  colorScheme: "light",
  reducedMotion: "no-preference",
});
await ctx.addInitScript(() => {
  // seeded random numbers: ids and anything else that draws on Math.random come out the same each run
  let a = 20261123;
  Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  // a visible cursor and click ripple, so the recording reads as a person using the app
  // freeze everything that depends on time (transitions, spinners, the blinking caret), so each frame is the final state
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;caret-color:transparent!important}";
  const mount = () => {
    if (!freeze.isConnected) document.head.appendChild(freeze);
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText = "position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))";
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9-6.5 1.6L9.4 19z" fill="#0a3b33" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    window.__cur = (x, y) => { c.style.transform = `translate(${x}px,${y}px)`; window.__pos = [x, y]; };
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
  // wait until fonts are loaded and two frames have been painted, so the capture does not depend on timing
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
  const png = PNG.sync.read(await page.screenshot({ type: "png" }));
  frames.push({ rgba: resize(png), delay });
}
// hold: stay on the current view for ms. animated: sample frames while something moves.
async function hold(ms, animated = false) {
  if (!animated || ms < 200) { await page.waitForTimeout(260); return snap(ms); } // let CSS transitions finish first
  const step = 130;
  for (let t = 0; t < ms; t += step) { await page.waitForTimeout(40); await snap(step); }
}

// ---- helpers ----
let cur = [W / 2, H / 2];
async function moveTo(x, y) {
  {
    const n = 5;
    for (let i = 1; i <= n; i++) {
      const t = i / n, e = t * t * (3 - 2 * t);
      await page.evaluate(([x, y]) => window.__cur(x, y), [cur[0] + (x - cur[0]) * e, cur[1] + (y - cur[1]) * e]);
      await snap(70);
    }
  }
  cur = [x, y];
}
async function click(loc, { after = 700, animated = false } = {}) {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await loc.boundingBox();
  await moveTo(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.evaluate(() => window.__ripple());
  await loc.click();
  await page.mouse.move(W - 3, H - 3); // park the real pointer so no tooltip or hover state lingers in the frame
  if (after > 0) await hold(after, animated);
}
async function type(loc, text, { clear = false } = {}) {
  await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const bb = await loc.boundingBox();
  await moveTo(bb.x + Math.min(bb.width - 12, 60), bb.y + bb.height / 2);
  await loc.click();
  if (clear) { await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.press("Backspace"); }
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
await page.getByRole("tab", { name: "Design" }).waitFor();
await moveTo(W * 0.62, H * 0.5);
await hold(1600);

// Colours: the brand palette used for every card
for (const n of ["Layout", "Background"]) await section(n, false);
await section("Colours", true);
await click(btn("Blue pink gloss", { exact: true }), { after: 1400 });
await section("Colours", false);

// Text: the card says what the post is about
await click(page.getByRole("tab", { name: "Text" }), { after: 500 });
await type(page.locator("#eyebrow"), "Data pipeline · Bank statements", { clear: true });
await type(page.locator("#title"), "Bank statements to cash flow", { clear: true });
await type(page.locator("#subtitle"), "Ingest. Parse. Categorise. Summarise.", { clear: true });
await type(page.locator("#footerl"), "senthilsweb.com", { clear: true });
await type(page.locator("#footer"), "github.com/senthilsweb/cardpress", { clear: true });
await hold(1000);

// Design: two looks for the same card
await click(page.getByRole("tab", { name: "Design" }), { after: 500 });
await section("Background", true);
await click(btn("Geometric"), { after: 2200 });
await click(btn("Contours"), { after: 2400 });

// Assistant: paste an article, get a draft, approve it into a post
await click(page.getByRole("button", { name: "Assistant", exact: true }), { after: 900 });
const src = page.locator("#chat-text");
await src.evaluate((el) => el.scrollIntoView({ block: "center" }));
const sb = await src.boundingBox();
await moveTo(sb.x + 80, sb.y + 40);
await src.click();
await src.fill(SOURCE);
await hold(1400);
await click(btn("Draft from this"), { after: 0 });
await page.getByRole("button", { name: "Approve and use" }).waitFor({ timeout: 20000 });
await hold(1600);
await click(page.getByText("Also use the title as the card's title"), { after: 500 }); // keep our own card title
await click(btn("Approve and use"), { after: 1200 });
await click(page.getByRole("button", { name: /Open the Post tab/ }), { after: 1000 });

// Post: hashtags and the full preview
const tag = page.getByLabel("Add a hashtag");
await tag.evaluate((el) => el.scrollIntoView({ block: "center" }));
// the demo agent suggests a few tags; clear them and add our own
for (let n = await page.getByRole("button", { name: /^Remove #/ }).count(); n > 0; n--) await click(page.getByRole("button", { name: /^Remove #/ }).first(), { after: 250 });
for (const t of ["DataEngineering", "CashFlow", "Fintech"]) {
  await type(tag, t);
  await page.keyboard.press("Enter");
  await hold(500, true);
}
await click(page.getByRole("button", { name: /Full preview/ }).first(), { after: 2800 });
await page.keyboard.press("Escape");
await hold(800);

// Sizes for every network
await click(page.getByRole("button", { name: "Square", exact: true }).nth(2), { after: 1500 });
await click(page.getByRole("button", { name: "Story", exact: true }), { after: 1500 });
await click(page.getByRole("button", { name: "All sizes", exact: true }), { after: 2400 });
await click(page.getByRole("button", { name: "One", exact: true }), { after: 400 });
await click(page.getByRole("button", { name: "Post image", exact: true }).first(), { after: 1600 });

await ctx.close();
writeGif();
await browser.close();

function writeGif() {
  // merge frames that did not change into the previous one's delay
  const diff = (a, b) => { for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) return true; return false; };
  const seq = [];
  for (const f of frames) {
    const last = seq[seq.length - 1];
    if (last && !diff(last.rgba, f.rgba)) last.delay += f.delay; else seq.push({ ...f });
  }
  const enc = GIFEncoder();
  let prev = null;
  seq.forEach((f, i) => {
    if (i === 0) {
      const palette = quantize(f.rgba, 256);
      enc.writeFrame(applyPalette(f.rgba, palette), GW, GH, { palette, delay: f.delay, repeat: 0 });
    } else {
      // each later frame gets its own palette, built only from the pixels that changed; the rest stay transparent
      const changed = [];
      for (let o = 0; o < f.rgba.length; o += 4) if (Math.abs(f.rgba[o] - prev[o]) + Math.abs(f.rgba[o + 1] - prev[o + 1]) + Math.abs(f.rgba[o + 2] - prev[o + 2]) > 6) changed.push(f.rgba[o], f.rgba[o + 1], f.rgba[o + 2], 255);
      const palette = quantize(Uint8Array.from(changed), 255);
      palette.push([0, 0, 0]);
      const idx = applyPalette(f.rgba, palette.slice(0, 255));
      for (let px = 0, o = 0; px < idx.length; px++, o += 4) {
        if (Math.abs(f.rgba[o] - prev[o]) + Math.abs(f.rgba[o + 1] - prev[o + 1]) + Math.abs(f.rgba[o + 2] - prev[o + 2]) <= 6) idx[px] = 255;
      }
      enc.writeFrame(idx, GW, GH, { palette, delay: f.delay, transparent: true, transparentIndex: 255, dispose: 1 });
    }
    prev = f.rgba;
  });
  enc.finish();
  fs.writeFileSync(OUT + "demo.gif", enc.bytes());
  if (process.env.DUMP) {
    fs.mkdirSync(OUT + "frames", { recursive: true });
    seq.forEach((f, i) => { if (i % Number(process.env.DUMP) === 0) { const png = new PNG({ width: GW, height: GH }); png.data = Buffer.from(f.rgba); fs.writeFileSync(`${OUT}frames/${String(i).padStart(4, "0")}.png`, PNG.sync.write(png)); } });
  }
  console.log("delays", createHash("sha1").update(JSON.stringify(seq.map((f) => f.delay))).digest("hex").slice(0, 8), "pixels", createHash("sha1").update(Buffer.concat(seq.map((f) => Buffer.from(f.rgba)))).digest("hex").slice(0, 8));
  console.log("wrote out/demo.gif", seq.length, "frames", (enc.bytes().length / 1e6).toFixed(1) + " MB");
}
