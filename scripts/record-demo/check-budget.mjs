// Browser check of a brand's budget: the alert is said in the chat, a reply stops when the amount is used up, the next
// message is refused, and the settings page and the dashboard show where the brand stands.
import { BASE, setup } from "./setup.mjs";

const out = process.argv[2] || ".";
const { ctx, api, close } = await setup({ width: 1280, height: 900, scale: 1 });
const problems = [];
try {
  // each reply of the stand-in costs 4 cents: 10 cents a month is the alert after two and used up in the third
  await api("PUT", "/profiles/templrpress/assistant", { tier: "standard", checks: true, rounds: 3, monthCents: 10, alertPercent: 50 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`page: ${e.message}`));
  await page.goto(`${BASE}/studio/`);
  await page.getByRole("button", { name: "New", exact: true }).first().click();
  const message = page.getByLabel("Message", { exact: true });
  const say = async (text) => { await message.fill(text); await page.getByRole("button", { name: "Send", exact: true }).first().click(); };

  await say("Write a short Thanksgiving post to our readers.");
  await page.getByText("The greeting post and the words on its card are saved.").first().waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Send", exact: true }).first().waitFor();
  await say("A little warmer, please.");
  await page.getByText("This brand has used 80% of its assistant budget for the month.").waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${out}/budget-alert.png` });
  await page.getByRole("button", { name: "Send", exact: true }).first().waitFor();
  await say("And shorter.");
  await page.getByText("This brand's assistant budget for the month is used up. The agent stopped.").first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${out}/budget-used.png` });
  await page.getByRole("button", { name: "Send", exact: true }).first().waitFor();
  await say("Once more.");
  await page.getByText("This brand's assistant budget for the month is used up.", { exact: true }).first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${out}/budget-refused.png` });

  const got = await api("GET", "/profiles/templrpress/assistant");
  if (got.budget.spentCents !== 10 || got.budget.level !== "used") problems.push(`the brand's budget: ${JSON.stringify(got.budget)}`);

  await page.goto(`${BASE}/settings/brand-assistant/`);
  await page.getByText("$0.10 of $0.10 this month").waitFor();
  await page.getByText("Used up").waitFor();
  await page.screenshot({ path: `${out}/budget-settings.png` });

  await page.goto(`${BASE}/dashboard/`);
  await page.getByText("$0.10 of $0.10 this month").waitFor();
  await page.screenshot({ path: `${out}/budget-dashboard.png`, fullPage: true });

  // the server's own amount
  await page.goto(`${BASE}/settings/assistant/`);
  await page.getByLabel("Monthly budget (USD)").fill("50");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Assistant saved").waitFor();
  await page.getByText("$0.10 of $50.00 this month").waitFor();
  await page.screenshot({ path: `${out}/budget-server.png` });
  const server = await api("GET", "/assistant");
  if (!server.saved || server.settings.monthCents !== 5000) problems.push(`the server's amount: ${JSON.stringify(server)}`);

  await page.goto(`${BASE}/settings/security/`);
  await page.getByText("Budget used up").first().waitFor();
  await page.getByText("Budget alert").first().waitFor();
} catch (e) {
  problems.push(String(e));
} finally {
  await close();
}
console.log(problems.length ? problems.join("\n") : "ok");
process.exit(problems.length ? 1 : 0);
