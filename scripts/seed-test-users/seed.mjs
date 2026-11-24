#!/usr/bin/env node
// Creates one account of each role on a running CardPress, for trying the app, with a little work for the editor and the
// writer so that what each role sees and may do can be compared. For TEST servers only: the accounts have a known password,
// so the script refuses any server that is not on this machine unless you say --force.
//
//   node seed.mjs [--server http://127.0.0.1:8080] [--password <test password>]
//                 [--admin-email <e> --admin-password <p>]   (only if the server already has an admin)
//
// See README.md for the accounts and the default password.

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback; };
const server = opt("server", "http://127.0.0.1:8080").replace(/\/$/, "");
const password = opt("password", "cardpress-test-password");

const host = new URL(server).hostname;
if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host) && !argv.includes("--force")) {
  console.error(`Refusing: ${host} is not this machine. These accounts have a known password. Use --force only for a throwaway server.`);
  process.exit(3);
}

const ACCOUNTS = [
  { first: "Test", last: "Admin", email: "admin@cardpress.test", role: "admin" },
  { first: "Test", last: "Editor", email: "editor@cardpress.test", role: "editor" },
  { first: "Test", last: "Writer", email: "writer@cardpress.test", role: "writer" },
];

/** A tiny client that keeps its own session cookie. */
function browser() {
  let cookie = "";
  return async (method, path, body) => {
    const res = await fetch(`${server}/api/v1${path}`, {
      method,
      headers: { ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("cardpress_session=")) cookie = c.split(";")[0];
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok && res.status !== 409) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 200)}`);
    return { status: res.status, body: json };
  };
}

const para = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...p) => ({ type: "doc", content: p.map(para) });

async function main() {
  const info = await (await fetch(`${server}/api/v1/info`)).json();
  if (!info.accounts) { console.error("This server does not use accounts."); process.exit(2); }

  const admin = browser();
  const adminEmail = opt("admin-email", ACCOUNTS[0].email), adminPassword = opt("admin-password", password);
  if (info.needsSetup) {
    await admin("POST", "/auth/signup", { firstName: ACCOUNTS[0].first, lastName: ACCOUNTS[0].last, email: ACCOUNTS[0].email, password });
    console.log(`created admin   ${ACCOUNTS[0].email} (the first account, so it adopted whatever was already here)`);
  } else {
    const r = await admin("POST", "/auth/login", { email: adminEmail, password: adminPassword }).catch(() => null);
    if (!r || r.status !== 200) { console.error("The server already has accounts. Give --admin-email and --admin-password of an admin."); process.exit(2); }
  }

  for (const a of ACCOUNTS.slice(1)) {
    const r = await admin("POST", "/users", { firstName: a.first, lastName: a.last, email: a.email, password, role: a.role });
    console.log(r.status === 409 ? `already there ${a.email}` : `created ${a.role.padEnd(7)} ${a.email}`);
  }

  // a little work each, so what each role sees and may do can be compared
  const sample = [
    { who: ACCOUNTS[1], brand: "Editor workspace", text: "An editor's first post. Editors approve and publish their own work.", approve: true },
    { who: ACCOUNTS[2], brand: "Writer workspace", text: "A writer's first draft. A writer drafts; an admin approves and publishes.", approve: false },
  ];
  for (const s of sample) {
    const c = browser();
    await c("POST", "/auth/login", { email: s.who.email, password });
    const have = (await c("GET", "/state")).body.profiles.some((p) => p.name === s.brand);
    if (have) { console.log(`  ${s.who.role} already has "${s.brand}"`); continue; }
    const id = s.brand.toLowerCase().replace(/\W+/g, "-") + "-" + Math.random().toString(36).slice(2, 6);
    const made = await c("POST", "/profiles", { id, name: s.brand, displayName: `${s.who.first} ${s.who.last}`, handle: `@${s.who.role}`, website: "", logoText: s.brand, logoSub: "", mark: "diamond", displayFont: "Space Grotesk Variable", bodyFont: "Inter Variable", palettes: [] });
    if (made.status === 409) continue;
    const mine = (await c("GET", "/state")).body.profiles.find((p) => p.id === id);
    if (!mine) continue;
    const d = await c("POST", "/drafts", { profileId: id, kind: "post", doc: doc(s.text), hashtags: [], altText: "", unicodeStyles: false });
    if (s.approve) await c("POST", `/drafts/${d.body.id}/approve`);
    console.log(`  ${s.who.role} has a brand "${s.brand}" with one ${s.approve ? "approved" : "draft"} post`);
  }
  console.log(`\nSign in at ${server}/login/ with any of those emails and the test password (see scripts/seed-test-users/README.md).`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
