// Browser check of Settings → Writing guides: start from ours, preview, save, refusal, history and restore.
import { BASE, setup } from "./setup.mjs";

const out = process.argv[2] || ".";
const { ctx, api, close } = await setup({ width: 1280, height: 900, scale: 1 });
const problems = [];
try {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`page: ${e.message}`));
  await page.goto(`${BASE}/settings/guides/`);
  const text = page.getByLabel("Your guide (Markdown)");
  const preview = page.getByRole("region", { name: "Preview" });
  const save = page.getByRole("button", { name: "Save", exact: true });
  await page.getByRole("button", { name: "Start from ours" }).click();
  await preview.getByRole("heading", { name: "Voice" }).waitFor();
  await text.fill("## Audience\nData engineers and their managers.\n\n## Voice\n- Plain and direct.\n- **No** hype words.\n\n<img src=x onerror=alert(1)>");
  if (await preview.locator("img").count()) problems.push("the preview made HTML");
  await save.click();
  await page.getByRole("alert").filter({ hasText: "no HTML" }).first().waitFor();
  await text.fill("## Audience\nData engineers and their managers.\n\n## Voice\n- Plain and direct.\n- **No** hype words.");
  await save.click();
  await page.getByText("Guide saved").waitFor();
  await page.getByText("Your guide", { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/guides-saved.png` });

  // another kind keeps what was typed; the check refuses; Cancel puts back
  await page.getByRole("tab", { name: /Articles/ }).click();
  await text.fill("Please REFUSE this.");
  await page.getByRole("tab", { name: /Posts/ }).click();
  await page.getByRole("tab", { name: /Articles/ }).click();
  if (await text.inputValue() !== "Please REFUSE this.") problems.push("what was typed was lost between tabs");
  await save.click();
  await page.getByRole("alert").filter({ hasText: "did not accept" }).first().waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  if (await text.inputValue() !== "") problems.push("cancel did not put back");

  await page.getByRole("tab", { name: /Posts/ }).click();
  await text.fill("## Voice\nShort.");
  await save.click();
  await page.getByText("Guide saved").first().waitFor();
  await page.getByRole("button", { name: "History" }).click();
  const dialog = page.getByRole("dialog", { name: "History: Posts" });
  await dialog.getByRole("button", { name: /Version 1/ }).click();
  await page.screenshot({ path: `${out}/guides-history.png` });
  await dialog.getByRole("button", { name: "Restore" }).click();
  await page.getByText("Version 1 restored").waitFor();
  let got = await api("GET", "/profiles/templrpress/guides");
  if (got.guides[0].version !== 3 || !got.guides[0].body.startsWith("## Audience")) problems.push(`restore: ${JSON.stringify(got.guides[0])}`);
  await page.getByRole("button", { name: "Use our style" }).click();
  await page.getByText("Our style is used again").waitFor();
  got = await api("GET", "/profiles/templrpress/guides");
  if (got.guides[0].body !== "") problems.push("our style is not used again");

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/settings/guides/`);
  await page.getByLabel("Your guide (Markdown)").waitFor();
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) problems.push("the page scrolls sideways on a phone");
  await page.screenshot({ path: `${out}/guides-phone.png` });
} catch (e) {
  problems.push(String(e));
} finally {
  await close();
}
console.log(problems.length ? problems.join("\n") : "ok");
process.exit(problems.length ? 1 : 0);
