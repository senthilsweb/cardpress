import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build, readPage } from "./build.mjs";
import { PAGES, search, searchIndex } from "./content.mjs";

describe("user guide", () => {
  const out = mkdtempSync(join(tmpdir(), "guide-"));
  build(out);

  it("lists every page written, in the order asked for", () => {
    const written = readdirSync(new URL("./pages", import.meta.url)).map((f) => f.replace(".html", "")).sort();
    expect(written).toEqual(PAGES.map(([s]) => s).sort());
    expect(PAGES.slice(0, 7).map(([s]) => s)).toEqual(["start", "brands", "social", "posts", "articles", "together", "greetings"]);
    expect(existsSync(join(out, "index.html"))).toBe(true);
  });

  it("has no broken link, picture or heading anchor", () => {
    for (const file of readdirSync(out).filter((f) => f.endsWith(".html"))) {
      const html = readFileSync(join(out, file), "utf8");
      for (const [, url] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        if (/^https:/.test(url)) continue;
        const [name, anchor] = url.split("#");
        const target = join(out, name || file);
        expect(existsSync(target), `${file}: ${url}`).toBe(true);
        if (anchor) expect(readFileSync(target, "utf8"), `${file}: ${url}`).toContain(`id="${anchor}"`);
      }
    }
  });

  it("can be searched", () => {
    const index = searchIndex(readPage);
    expect(search(index, "renew token")[0]).toMatchObject({ slug: "social", anchor: "linkedin-renew-the-token" });
    expect(search(index, "thanksgiving headlines").map((h) => h.slug)).toContain("greetings");
    expect(search(index, "zzzz")).toEqual([]);
  });

  it("says backgrounds can be plugged in or replaced by a custom picture", () => {
    for (const slug of ["backgrounds", "greetings"]) expect(readPage(slug)).toContain("New backgrounds can be plugged in.");
  });
});
