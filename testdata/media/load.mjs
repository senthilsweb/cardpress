// Puts these pictures into a brand's media library on a CardPress on this machine, and makes one example post for
// each way a card shows a picture. Signs in as the test admin of scripts/seed-test-users.
//
//   node testdata/media/load.mjs [server] [brand id]      from the repository, after `npm ci` in scripts/record-demo
import { createRequire } from "node:module";
import path from "node:path";

const here = import.meta.dirname;
const { chromium } = createRequire(path.join(here, "../../scripts/record-demo/package.json"))("playwright-core");
const server = (process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(server).hostname)) throw new Error("only a server on this machine");

const FILES = {
  background: ["mountain-lake", "ocean-waves"],
  screenshot: ["cardpress-dashboard"],
  photos: ["coffee-mug", "blue-cup", "forest-path", "castle-at-night", "desk", "pink-flowers"],
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const api = async (method, url, data) => {
    const res = await ctx.request.fetch(`${server}/api/v1${url}`, { method, data: data === undefined ? undefined : JSON.stringify(data), headers: { origin: server, "content-type": "application/json" } });
    if (!res.ok()) throw new Error(`${method} ${url}: ${res.status()} ${(await res.text()).slice(0, 200)}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
  await api("POST", "/auth/login", { email: "admin@cardpress.test", password: "cardpress-test-password" });
  const state = await api("GET", "/state");
  const brand = process.argv[3] ? state.profiles.find((p) => p.id === process.argv[3]) : state.profiles[0];
  if (!brand) throw new Error("no such brand");
  await api("PUT", "/preferences/activeProfile", brand.id);

  // through the Media page, which reduces the pictures and draws their thumbnails
  const page = await ctx.newPage();
  await page.goto(`${server}/media/`);
  await page.locator('input[type="file"]').first().waitFor({ state: "attached" });
  const list = async () => (await api("GET", `/profiles/${brand.id}/assets?pageSize=48&q=`)).items;
  const wanted = Object.entries(FILES).flatMap(([folder, names]) => names.map((name) => ({ folder, name, file: path.join(here, folder, `${name}.${folder === "screenshot" ? "png" : "jpg"}`) })));
  const have = new Set((await list()).map((a) => a.name));
  const missing = wanted.filter((w) => !have.has(w.name));
  if (missing.length) await page.locator('input[type="file"]').first().setInputFiles(missing.map((w) => w.file));
  let items = [];
  for (let i = 0; i < 60; i++) {
    items = await list();
    if (wanted.every((w) => items.some((a) => a.name === w.name))) break;
    await page.waitForTimeout(500);
  }
  const ref = (name) => { const a = items.find((x) => x.name === name); if (!a) throw new Error(`${name} was not added`); return `asset:${a.id}`; };

  const card = (layout, background, title, subtitle, pictures) => ({
    sizeId: "li-square", layout, background, paletteId: brand.palettes?.[0]?.id ?? "deep-navy-cyan-violet", seed: 7, eyebrow: "Test picture", title, subtitle, footer: "", footerLeft: "", tag: "", quoteAuthor: "", statValue: "",
    titleScale: 1, intensity: 0.85, bottomFade: 0.3, showLogo: true, showFooter: true, photos: [], ...pictures,
  });
  const examples = [
    ["Example: background image", card("hero", "image", "Your own picture", "Background image on Own image.", { bgImage: ref("mountain-lake"), shade: 0.7 })],
    ["Example: app screenshot", card("hero", "browser", "See the new screen", "App screenshot in a Browser frame.", { screenshot: ref("cardpress-dashboard") })],
    ["Example: photo mosaic", card("hero", "mosaic", "A week in pictures", "Photos as a mosaic.", { photos: FILES.photos.map(ref) })],
    ["Example: headshot", card("split", "dots", "Meet the team", "The first photo as the headshot.", { photos: [ref("blue-cup")] })],
  ];
  const drafts = await api("GET", `/drafts?profileId=${encodeURIComponent(brand.id)}`);
  const made = JSON.stringify(drafts);
  for (const [name, design] of examples) {
    if (made.includes(name)) continue;
    await api("POST", "/drafts", { profileId: brand.id, kind: "post", title: "", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `${name}.` }] }] }, hashtags: [], altText: name, unicodeStyles: false, design });
  }
  console.log(`${brand.name}: ${wanted.length} pictures in the library, ${examples.length} example posts`);
} finally {
  await browser.close();
}
