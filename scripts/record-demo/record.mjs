// Records the home-page animation, the same way every time: a fixed script, example data, a scripted assistant (no AI),
// a seeded Math.random, explicit frame delays and no real-time dependence in the output. Run it through ./run.sh.
// DUMP=n also writes every nth frame to out/frames for review.
import gifenc from "gifenc";
import pngjs from "pngjs";
const { GIFEncoder, quantize, applyPalette } = gifenc;
const { PNG } = pngjs;
import fs from "node:fs";
import { createHash } from "node:crypto";
import { BASE, setup } from "./setup.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const W = 1440, H = 860, GW = 1200, GH = Math.round((H * GW) / W);

const frames = [];
// frames are captured at 2x and scaled down, so text and card edges stay sharp
const demo = await setup({ width: W, height: H, addInitScript: () => {
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
} });
const { ctx } = demo;
try {
const page = await ctx.newPage();

// ---- frame capture (gif mode) ----
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
// a button by its exact name, within a part of the page when given
const btn = (name, within = page) => within.getByRole("button", { name, exact: true }).first();
const settle = async () => { await page.waitForLoadState("networkidle").catch(() => {}); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(900); };
async function visit(url, ms) {
  await page.goto(BASE + url);
  await settle();
  await page.evaluate(([x, y]) => window.__cur(x, y), cur);
  await hold(ms);
}

// ---- the story: a Thanksgiving greeting, from a sentence to a card, then around the app ----
await visit("/studio/", 400);
await click(btn("New"), { after: 900 });

// Chat: ask for the greeting
const message = page.getByLabel("Message", { exact: true });
await type(message, "Write a short Thanksgiving post to our readers.");
await click(btn("Send"), { after: 0 });
await page.getByText("The greeting post and the words on its card are saved.").waitFor({ timeout: 30000 });
await settle();
await hold(2200);

// Design: the greeting layout and a seasonal background
await click(btn("Design"), { after: 700 });
await click(btn("Greeting"), { after: 1200 });
await click(btn("Browse backgrounds"), { after: 900 });
const picker = page.getByRole("dialog");
await type(picker.getByLabel("Search backgrounds"), "thanks");
await hold(1200);
await click(btn("Harvest frame", picker), { after: 900 });
await click(btn("Use", picker), { after: 900 });
await hold(2400);

// Chat: pick another headline, keep it
await click(btn("Chat"), { after: 700 });
// the whole card, not the feed preview that Chat opens with
await click(page.getByRole("switch", { name: /Feed preview/ }), { after: 900 });
await click(page.getByRole("radio", { name: /Giving Thanks/ }), { after: 1600 });
await click(page.getByRole("radio", { name: /Thanksgiving!/ }), { after: 900 });
await click(btn("Save as version"), { after: 1400 });

// Details and the full preview
await click(btn("Details"), { after: 1600 });
await click(btn("Full preview"), { after: 3000 });
await page.keyboard.press("Escape");
await hold(600);

// around the app
await visit("/library/", 2400);
await visit("/calendar/", 2400);
await visit("/settings/appearance/", 1200);
await click(page.getByRole("button", { name: /^Aubergine/ }), { after: 1500 });
await click(page.getByRole("button", { name: /^Cobalt/ }), { after: 1500 });
await click(btn("Dark"), { after: 1600 });
await click(btn("Light"), { after: 500 });
await click(page.getByRole("button", { name: /^Parchment/ }), { after: 600 });
await visit("/studio/", 3000);

writeGif();
} finally {
  await demo.close();
}

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
