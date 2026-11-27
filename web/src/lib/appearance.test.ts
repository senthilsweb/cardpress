import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAppearance, resolveMode, THEMES } from "./appearance";
import { contrast } from "./contrast";

describe("appearance", () => {
  it("defaults to Parchment, following the system", () => {
    expect(readAppearance({})).toEqual({ theme: "parchment", mode: "system" });
    expect(readAppearance({ palette: "neon", theme: 3 })).toEqual({ theme: "parchment", mode: "system" });
    expect(readAppearance({ palette: "cobalt", theme: "dark" })).toEqual({ theme: "cobalt", mode: "dark" });
    expect([resolveMode("system", true), resolveMode("system", false), resolveMode("light", true)]).toEqual(["dark", "light", "light"]);
  });
});

/** The colour names of one theme and mode, read from the stylesheet itself. */
function colours(theme: string, mode: "light" | "dark") {
  const css = readFileSync(new URL("../styles/themes.css", import.meta.url), "utf8");
  // a block is found by the first selector of its list
  const block = (selector: string) => {
    const at = css.search(new RegExp(`(^|\\n)${selector.replace(/[[\]"]/g, "\\$&")}(, [^{]*)? \\{`));
    return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
  };
  const selectors = [":root", ...(theme === "parchment" ? [] : [`[data-palette="${theme}"]`]), ...(mode === "dark" ? ['[data-theme="dark"]', ...(theme === "parchment" ? [] : [`[data-palette="${theme}"][data-theme="dark"]`])] : [])];
  const out: Record<string, string> = {};
  for (const s of selectors) for (const [, name, value] of block(s).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/g)) out[name] = value;
  return out;
}

describe("every theme can be read", () => {
  for (const { id } of THEMES)
    for (const mode of ["light", "dark"] as const)
      it(`${id}, ${mode}`, () => {
        const c = colours(id, mode);
        for (const [text, ground] of [["ink", "paper"], ["ink", "card-bg"], ["muted-ink", "paper"], ["muted-ink", "card-bg"], ["head-fg", "head-bg"], ["head-muted", "head-bg"], ["side-fg", "side-bg"], ["side-muted", "side-bg"], ["on-brand", "brand"]]) {
          expect(c[text], `${text} is set`).toBeTruthy();
          expect(contrast(c[text], c[ground]), `${text} ${c[text]} on ${ground} ${c[ground]}`).toBeGreaterThanOrEqual(4.5);
        }
      });
});
