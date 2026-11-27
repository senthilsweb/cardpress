// Takes the user guide's screenshots that need no real work: brands, social accounts, calendar and the background picker.
// The pictures of posts and the library come from a real installation and are taken by hand.
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { BASE, setup } from "./setup.mjs";

const OUT = path.resolve(import.meta.dirname, "../../web/guide/img");
const { ctx, api, card, paragraphs, close } = await setup({ width: 1456, height: 839, scale: 1 });
try {
  const page = await ctx.newPage();
  const open = async (url) => { await page.goto(BASE + url); await page.waitForLoadState("networkidle").catch(() => {}); await page.evaluate(() => document.fonts.ready); await sleep(1200); };
  const shot = async (name, height = 839) => { await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 85, clip: { x: 0, y: 0, width: 1456, height } }); console.log("wrote", name); };

  await open("/settings/brands/");
  await shot("brands", 540);
  await open("/settings/social/");
  await shot("social", 710);
  await open("/calendar/");
  await shot("calendar");

  // a greeting with its words written, so every background in the picker is shown carrying them
  const greeting = { ...card("greeting", "mesh", "autumn-cream", "Happy", "Thanksgiving!", "With thanks to every reader."), sizeId: "li-square" };
  await api("POST", "/drafts", { profileId: "templrpress", kind: "post", title: "", doc: paragraphs("Happy Thanksgiving from TemplrPress."), hashtags: [], altText: "", unicodeStyles: false, design: greeting });
  await open("/studio/");
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await page.getByRole("button", { name: "Browse backgrounds", exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker.getByRole("button", { name: "Seasonal greetings", exact: true }).click();
  await picker.getByRole("button", { name: "Harvest frame", exact: true }).click();
  await sleep(1500);
  await shot("picker");
} finally {
  await close();
}
