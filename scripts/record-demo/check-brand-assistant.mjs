// Browser check of Settings → Brand assistant: the page saves, cancels and goes back to the defaults.
import { BASE, setup } from "./setup.mjs";

const out = process.argv[2] || ".";
const { ctx, api, close } = await setup({ width: 1280, height: 900, scale: 1 });
const problems = [];
try {
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`page: ${e.message}`));
  await page.goto(`${BASE}/settings/brand-assistant/`);
  await page.getByText("Check first drafts").waitFor();
  await page.screenshot({ path: `${out}/brand-assistant-1.png` });

  await page.getByLabel("Check first drafts").click();
  await page.getByLabel("Monthly budget (USD)").fill("25.50");
  await page.getByLabel("Alert at").click();
  await page.getByRole("option", { name: "70%" }).click();
  await page.getByText("Unsaved changes").waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Assistant saved").waitFor();
  let got = await api("GET", "/profiles/templrpress/assistant");
  if (!got.saved || got.settings.checks || got.settings.monthCents !== 2550 || got.settings.alertPercent !== 70) problems.push(`saved: ${JSON.stringify(got.settings)}`);
  await page.screenshot({ path: `${out}/brand-assistant-2.png` });

  // what cannot be an amount is said, and Cancel puts back what was saved
  await page.getByLabel("Monthly budget (USD)").fill("lots");
  await page.getByRole("alert").filter({ hasText: "Monthly budget" }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  if (await page.getByLabel("Monthly budget (USD)").inputValue() !== "25.50") problems.push("cancel did not put the amount back");

  await page.getByRole("button", { name: "Use defaults" }).click();
  await page.getByText("Defaults restored").waitFor();
  got = await api("GET", "/profiles/templrpress/assistant");
  if (got.saved || !got.settings.checks || got.settings.monthCents !== 0) problems.push(`defaults: ${JSON.stringify(got)}`);

  // the log names it
  await page.goto(`${BASE}/settings/security/`);
  await page.getByText("Brand assistant changed").first().waitFor();

  // phone width
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE}/settings/brand-assistant/`);
  await page.getByText("Check first drafts").waitFor();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (wide) problems.push("the page scrolls sideways on a phone");
  await page.screenshot({ path: `${out}/brand-assistant-phone.png` });
} catch (e) {
  problems.push(String(e));
} finally {
  await close();
}
console.log(problems.length ? problems.join("\n") : "ok");
process.exit(problems.length ? 1 : 0);
