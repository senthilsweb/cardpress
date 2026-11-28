// A CardPress to take pictures of: a new database, the stand-in assistant, one test person and example brands.
// Everything is thrown away afterwards. Nothing of anyone's real work is read.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";
import { startStandIn } from "./stand-in.mjs";

const PORT = 18300, AGENT_PORT = 18301;
export const BASE = `http://127.0.0.1:${PORT}`;
// the fixed test account of scripts/seed-test-users, for servers on this machine only
const PERSON = { firstName: "Test", lastName: "Admin", email: "admin@cardpress.test", password: "cardpress-test-password" };

const paragraphs = (text) => ({ type: "doc", content: text.split("\n\n").map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })) });

export async function setup({ width, height, scale = 2, addInitScript } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cardpress-demo-"));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    version: 5, agent_id: "agent_demo", environment_id: "env_demo", vault_id: "vlt_demo", mcp_server_url: `${BASE}/mcp`,
    guides: { post: { ours: "## Voice\n- Simple English.\n- No hype.", fixed: "Save the post to its draft. Keep to the limits." } },
    outcomes: { post: { description: "Write the post.", rubric: "- good", max_iterations: 3 }, article: { description: "Write the article.", rubric: "- good", max_iterations: 3 } },
  }));
  const bin = path.resolve(import.meta.dirname, process.env.CARDPRESS_BIN || "../../bin/cardpress");
  const log = fs.openSync(path.join(dir, "server.log"), "w");
  const app = spawn(bin, ["-addr", `127.0.0.1:${PORT}`, "-db", `file:${dir}/cardpress.db`], {
    cwd: dir, stdio: ["ignore", log, log],
    env: { HOME: process.env.HOME, PATH: process.env.PATH, CARDPRESS_AGENT: "cma", CARDPRESS_AGENT_MANIFEST: `${dir}/manifest.json`, CARDPRESS_PUBLIC_URL: BASE, ANTHROPIC_API_KEY: "simulated", ANTHROPIC_BASE_URL: `http://127.0.0.1:${AGENT_PORT}` },
  });
  let key = "";
  const stopAgent = startStandIn({ app: BASE, key: () => key, port: AGENT_PORT });
  const close = async (browser) => { await browser?.close(); stopAgent(); app.kill(); fs.rmSync(dir, { recursive: true, force: true }); };

  let browser;
  try {
    for (let i = 0; ; i++) {
      if (app.exitCode !== null || i > 100) throw new Error(`CardPress did not start:\n${fs.readFileSync(`${dir}/server.log`, "utf8")}`);
      try { if ((await fetch(`${BASE}/healthz`)).ok) break; } catch { /* not listening yet */ }
      await sleep(100);
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: "light", timezoneId: "America/New_York" });
    if (addInitScript) await ctx.addInitScript(addInitScript);

    const api = async (method, url, data) => {
      const res = await ctx.request.fetch(`${BASE}/api/v1${url}`, { method, data: data === undefined ? undefined : JSON.stringify(data), headers: { origin: BASE, "content-type": "application/json" } });
      if (!res.ok()) throw new Error(`${method} ${url}: ${res.status()} ${(await res.text()).slice(0, 300)}`);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    };
    await api("POST", "/auth/signup", PERSON);
    key = (await api("POST", "/api-keys", { name: "Stand-in assistant" })).secret;

    // opening the studio once makes the app write its starting brand, whose colour sets the examples reuse
    const first = await ctx.newPage();
    await first.goto(`${BASE}/studio/`);
    await first.getByRole("button", { name: "Design", exact: true }).waitFor();
    await first.waitForLoadState("networkidle").catch(() => {});
    await sleep(1500);
    await first.close();
    const state = await api("GET", "/state");
    const palettes = state.profiles[0].palettes;
    const brand = (id, name, handle, website) => ({ id, name, displayName: name, handle, website, logoText: name.toUpperCase(), logoSub: "", mark: "diamond", displayFont: "Space Grotesk Variable", bodyFont: "Inter Variable", palettes });
    await api("POST", "/profiles", brand("templrpress", "TemplrPress", "@templrpress", "github.com/senthilsweb/templrpress"));
    await api("POST", "/profiles", brand("cardpress", "CardPress", "@cardpress", "github.com/senthilsweb/cardpress"));
    await api("POST", "/profiles", brand("blue-harbor", "Blue Harbor Cafe", "@blueharbor", "blueharbor.example"));
    await api("PUT", "/preferences/activeProfile", "templrpress");
    for (const p of state.profiles) { await api("POST", `/profiles/${p.id}/archive`); await api("DELETE", `/profiles/${p.id}`); }

    // a little work, for the library and the calendar
    const card = (layout, background, paletteId, eyebrow, title, subtitle) => ({
      sizeId: "li-post", layout, background, paletteId, seed: 7, eyebrow, title, subtitle, footer: "@templrpress", footerLeft: "github.com/senthilsweb/templrpress",
      tag: "", quoteAuthor: "", statValue: "", titleScale: 1, intensity: 0.8, bottomFade: 0.4, showLogo: true, showFooter: true, photos: [],
    });
    // the brand's own card, so a new item starts with its footers and not the app's sample ones
    await api("PUT", "/designs", { designs: { templrpress: card("hero", "mesh", "cream-emerald", "TemplrPress", "Templates that travel", "One source, every format.") } });
    const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); return d.toISOString(); };
    const work = [
      ["article", "Reading list for December", card("cover", "contours", "cream-emerald", "Reading list", "Five good reads for December", "Short pieces on templates and writing."), 9],
      ["article", "Holiday opening hours", card("center", "dots", "deep-teal", "Notice", "Holiday hours", "When we answer in December."), 5],
      ["article", "Our year in review", card("hero", "mesh", "blue-pink-gloss", "2026", "Our year in review", "What changed and what comes next."), 2],
      ["post", "One template, many documents", card("hero", "geometric", "light-blue-purple", "Templates", "One template, many documents", "Write once, render everywhere."), 0],
      ["post", "Release notes without the pain", card("hero", "constellation", "deep-navy-cyan-violet", "Release notes", "Notes that write themselves", "From commits to a page."), 0],
    ];
    for (const [kind, title, design, days] of work) {
      const d = await api("POST", "/drafts", { profileId: "templrpress", kind, title: kind === "article" ? title : "", doc: paragraphs(`${title}.\n\nAn example item for TemplrPress.`), hashtags: [], altText: title, unicodeStyles: false, design });
      if (!days) continue;
      await api("POST", `/drafts/${d.id}/approve`);
      await api("PUT", `/drafts/${d.id}/plan`, { scheduledAt: inDays(days), timezone: "America/New_York" });
    }
    return { browser, ctx, api, card, paragraphs, dir, close: () => close(browser) };
  } catch (e) {
    await close(browser);
    throw e;
  }
}
