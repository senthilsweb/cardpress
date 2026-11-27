import { useSyncExternalStore } from "react";
import type { Design, FontRole, Profile } from "./types";

/**
 * Font registry. A font is just a family name:
 *  - "bundled" families ship with the app (fontsource, always available offline);
 *  - "google" families are loaded on demand from fonts.googleapis.com.
 * To add a font permanently, append a line to GOOGLE_FONTS. To add one on the fly, use "Add Google font" in the Profile panel.
 */
export interface FontDef {
  family: string;
  category: "sans" | "serif" | "mono" | "display" | "script";
  source: "bundled" | "google";
  weights?: string; // Google css2 weights, e.g. "400;600;700"
}

export const BUNDLED_FONTS: FontDef[] = [
  { family: "Space Grotesk Variable", category: "sans", source: "bundled" },
  { family: "Inter Variable", category: "sans", source: "bundled" },
  { family: "JetBrains Mono Variable", category: "mono", source: "bundled" },
];

export const GOOGLE_FONTS: FontDef[] = [
  { family: "DM Sans", category: "sans", source: "google", weights: "400;500;600;700" },
  { family: "Manrope", category: "sans", source: "google", weights: "400;500;600;700;800" },
  { family: "Sora", category: "sans", source: "google", weights: "400;600;700;800" },
  { family: "Outfit", category: "sans", source: "google", weights: "400;500;600;700" },
  { family: "Plus Jakarta Sans", category: "sans", source: "google", weights: "400;500;600;700;800" },
  { family: "Poppins", category: "sans", source: "google", weights: "400;500;600;700;800" },
  { family: "Montserrat", category: "sans", source: "google", weights: "400;500;600;700;800" },
  { family: "Work Sans", category: "sans", source: "google", weights: "400;500;600;700" },
  { family: "Fraunces", category: "serif", source: "google", weights: "400;600;700;800" },
  { family: "Playfair Display", category: "serif", source: "google", weights: "400;600;700;800" },
  { family: "Source Serif 4", category: "serif", source: "google", weights: "400;600;700" },
  { family: "Lora", category: "serif", source: "google", weights: "400;500;600;700" },
  { family: "Roboto Slab", category: "serif", source: "google", weights: "400;500;600;700" },
  { family: "DM Serif Display", category: "display", source: "google", weights: "400" },
  { family: "Bebas Neue", category: "display", source: "google", weights: "400" },
  { family: "IBM Plex Mono", category: "mono", source: "google", weights: "400;500;600;700" },
  { family: "Fira Code", category: "mono", source: "google", weights: "400;500;600;700" },
  { family: "Space Mono", category: "mono", source: "google", weights: "400;700" },
  { family: "Dancing Script", category: "script", source: "google", weights: "600;700" },
  { family: "Great Vibes", category: "script", source: "google", weights: "400" },
  { family: "Pacifico", category: "script", source: "google", weights: "400" },
  { family: "Kaushan Script", category: "script", source: "google", weights: "400" },
  { family: "Caveat", category: "script", source: "google", weights: "600;700" },
];
const SCRIPT_DEFAULT = "Dancing Script";

/* ------------------------------------------------------------ user-added fonts (saved on the server) */
const DEFAULT_WEIGHTS = "400;500;600;700";
let custom: FontDef[] = [];
let persist: ((list: FontDef[]) => void) | null = null;
const listeners = new Set<() => void>();
let snapshot: FontDef[] = compose();

/** Called once the server state is loaded: sets the saved custom fonts and where to save later changes. */
export function hydrateCustomFonts(list: FontDef[], save: (list: FontDef[]) => void) {
  custom = list.filter((f) => f && typeof f.family === "string");
  persist = save;
  snapshot = compose();
  listeners.forEach((l) => l());
}
function compose(): FontDef[] {
  return [...BUNDLED_FONTS, ...GOOGLE_FONTS, ...custom.filter((c) => ![...BUNDLED_FONTS, ...GOOGLE_FONTS].some((f) => f.family === c.family))];
}
function commit() {
  snapshot = compose();
  persist?.(custom);
  listeners.forEach((l) => l());
}

export function useFonts(): FontDef[] {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => snapshot, () => snapshot);
}

/** Verify the family exists on Google Fonts, then remember it. Resolves to an error message, or "" on success. */
export async function addGoogleFont(family: string): Promise<string> {
  const name = family.trim().replace(/\s+/g, " ");
  if (!name) return "Type a font family, e.g. Lexend";
  if (snapshot.some((f) => f.family.toLowerCase() === name.toLowerCase())) return "Already in the list";
  const def: FontDef = { family: name, category: "sans", source: "google", weights: DEFAULT_WEIGHTS };
  const ok = await loadGoogle(def);
  if (!ok) return `"${name}" was not found on Google Fonts (check spelling and capitals)`;
  custom = [...custom, def];
  commit();
  return "";
}
export function removeCustomFont(family: string) {
  custom = custom.filter((f) => f.family !== family);
  commit();
}

/* ------------------------------------------------------------ loading */
const loaded = new Map<string, Promise<boolean>>();

function cssUrl(family: string, weights?: string) {
  const f = encodeURIComponent(family).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${f}${weights ? `:wght@${weights}` : ""}&display=swap`;
}
function addLink(href: string): Promise<boolean> {
  return new Promise((resolve) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.crossOrigin = "anonymous";
    l.onload = () => resolve(true);
    l.onerror = () => { l.remove(); resolve(false); };
    document.head.appendChild(l);
  });
}
async function loadGoogle(def: FontDef): Promise<boolean> {
  // Not every family has every weight; fall back to the family's default weight if the full request is refused.
  const ok = (await addLink(cssUrl(def.family, def.weights))) || (await addLink(cssUrl(def.family)));
  if (ok) { try { await document.fonts.load(`700 16px "${def.family}"`); } catch { /* ignore */ } }
  return ok;
}

/** Make sure a family is available to the page. Bundled fonts are always there; safe to call repeatedly. */
export function ensureFont(family: string): Promise<boolean> {
  if (typeof document === "undefined" || family.endsWith(" Variable") || !family) return Promise.resolve(true);
  let p = loaded.get(family);
  if (!p) {
    const def = snapshot.find((f) => f.family === family) ?? { family, category: "sans" as const, source: "google" as const, weights: DEFAULT_WEIGHTS };
    p = loadGoogle(def);
    loaded.set(family, p);
  }
  return p;
}
/** Resolves when every requested font has finished loading (used before exporting an image). */
export const fontsSettled = () => Promise.all([...loaded.values()]).then(() => undefined);
/** Changes whenever a new family is loaded; the export cache keys on it. */
export const loadedKey = () => [...loaded.keys()].sort().join("|");

/* ------------------------------------------------------------ roles */
export const FONT_ROLES: { id: FontRole; label: string; hint: string }[] = [
  { id: "title", label: "Titles", hint: "Headline and quote mark" },
  { id: "body", label: "Body", hint: "Subtitle and general text" },
  { id: "label", label: "Labels", hint: "Eyebrow, footer, tag, author" },
  { id: "logo", label: "Logo text", hint: "Logo and its small line" },
  { id: "stat", label: "Big number", hint: "Stat layout number" },
  { id: "script", label: "Script", hint: "Greeting headline and sign-off" },
];

const MONO_DEFAULT = "JetBrains Mono Variable";

/** Resolve the family for each role: card override, then profile, then built-in default. */
export function resolveFonts(profile: Profile, design?: Pick<Design, "fonts">): Record<FontRole, string> {
  const o = design?.fonts ?? {};
  const title = o.title || profile.displayFont;
  const label = o.label || profile.labelFont || MONO_DEFAULT;
  return {
    title,
    body: o.body || profile.bodyFont,
    label,
    logo: o.logo || profile.logoFont || label,
    stat: o.stat || profile.statFont || title,
    script: o.script || profile.scriptFont || SCRIPT_DEFAULT,
  };
}
export const cssFamily = (f: string) => `'${f}', system-ui, sans-serif`;
