import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFull, buildQuick, PAGES, searchIndex } from "./build.mjs";

describe("user guide", () => {
  const out = mkdtempSync(join(tmpdir(), "guide-"));
  buildFull(out);

  it("builds every page listed, and lists every page written", () => {
    const written = readdirSync(new URL("./pages", import.meta.url)).map((f) => f.replace(".html", "")).sort();
    expect(written).toEqual(PAGES.map(([s]) => s).sort());
    for (const [slug] of PAGES) expect(existsSync(join(out, `${slug}.html`)), slug).toBe(true);
  });

  it("has no broken link, picture or heading anchor", () => {
    for (const [slug] of PAGES) {
      const html = readFileSync(join(out, `${slug}.html`), "utf8");
      for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (/^https:/.test(url)) continue;
        const [file, anchor] = url.split("#");
        const target = join(out, file || `${slug}.html`);
        expect(existsSync(target), `${slug}: ${url}`).toBe(true);
        if (anchor) expect(readFileSync(target, "utf8"), `${slug}: ${url}`).toContain(`id="${anchor}"`);
      }
    }
  });

  it("can be searched", () => {
    expect(searchIndex().some((e) => e.u === "social.html#linkedin-renew-the-token")).toBe(true);
  });

  it("builds a quick guide that links to the full one", () => {
    const q = mkdtempSync(join(tmpdir(), "quick-"));
    buildQuick(q);
    expect(readFileSync(join(q, "index.html"), "utf8")).toContain("https://www.senthilsweb.com/cardpress/guide/");
  });
});
