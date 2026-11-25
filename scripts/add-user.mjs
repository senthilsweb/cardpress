#!/usr/bin/env node
// Add one person to a CardPress server, signed in as an admin.
//
//   node scripts/add-user.mjs --server https://example.com --admin-email you@example.com \
//        --email new@example.com --first New --last Person --role editor
//
// It asks for the admin's password and the new person's password without showing them, so neither lands in the shell
// history. Roles: admin, editor, writer. Tell the new person to change the password after the first sign-in.
import readline from "node:readline";

const opt = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const need = (name) => {
  const v = opt(name);
  if (!v) { console.error(`--${name} is required`); process.exit(2); }
  return v;
};

function ask(label) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(label, (v) => { rl.close(); process.stdout.write("\n"); resolve(v); });
    rl._writeToOutput = (s) => { if (s.startsWith(label)) process.stdout.write(label); }; // typed characters are not shown
  });
}

async function main() {
  const server = need("server").replace(/\/$/, "");
  const adminEmail = need("admin-email");
  const person = { email: need("email"), firstName: need("first"), lastName: need("last"), role: opt("role", "editor") };
  if (!["admin", "editor", "writer"].includes(person.role)) { console.error("--role must be admin, editor or writer"); process.exit(2); }

  const adminPassword = await ask(`Password of ${adminEmail}: `);
  const password = await ask(`Password for ${person.email} (at least 10 characters): `);

  const login = await fetch(`${server}/api/v1/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (login.status !== 200) { console.error(`Could not sign in as ${adminEmail} (${login.status}).`); process.exit(1); }
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const res = await fetch(`${server}/api/v1/users`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ ...person, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 409) console.log(`${person.email} already has an account.`);
  else if (res.status >= 300) { console.error(`The server refused (${res.status}): ${body.error ?? body.message ?? "no reason given"}`); process.exitCode = 1; }
  else console.log(`Added ${person.firstName} ${person.lastName} <${person.email}> as ${person.role}.`);

  await fetch(`${server}/api/v1/auth/logout`, { method: "POST", headers: { cookie } }).catch(() => {});
}

main().catch((e) => { console.error(e.message); process.exit(1); });
