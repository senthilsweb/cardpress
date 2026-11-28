// Nothing is kept in the browser's storage: preferences live on the server (see prefs.ts) and in one cookie the server
// sets for the first paint. This keeps it so.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx|astro|js)$/.test(e.name) && !e.name.includes(".test.") ? [join(dir, e.name)] : []);

describe("browser storage", () => {
  it("is not written or read anywhere in the app", () => {
    const uses = files(SRC).flatMap((f) => readFileSync(f, "utf8").split("\n")
      .filter((line) => /\.(setItem|getItem)\s*\(|\bindexedDB\b|document\.cookie\s*=/.test(line))
      .map((line) => `${f.slice(SRC.length + 1)}: ${line.trim()}`));
    expect(uses).toEqual([]);
  });
});
