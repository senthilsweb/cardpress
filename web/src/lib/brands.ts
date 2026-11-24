import { DEFAULT_PROFILES } from "./profiles";
import type { Design, Profile } from "./types";

/** Helpers for working with several brands (profiles). They do no I/O. */

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "brand";

/** A new id that is not in `taken`. The random part keeps it unique across machines that share a database. */
export function newBrandId(name: string, taken: Iterable<string>, rand: () => number = Math.random): string {
  const used = new Set(taken);
  for (;;) {
    const id = `${slug(name)}-${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!used.has(id)) return id;
  }
}

export interface NewBrandInput {
  name: string;
  handle: string;
  /** Copy this brand's identity, colours and fonts. Nothing else belongs to a profile: accounts, drafts and posts are never copied. */
  from?: Profile;
}

/**
 * Build the profile for a new brand. Blank starts from the default look with the identity cleared; a copy keeps the
 * other brand's logo, fonts and colour sets. Either way the new brand has its own id, name and handle.
 */
export function buildBrand(input: NewBrandInput, taken: Iterable<string>, rand?: () => number): Profile {
  const name = input.name.trim();
  const handle = input.handle.trim();
  const id = newBrandId(name, taken, rand);
  if (input.from) {
    const copy = structuredClone(input.from);
    return { ...copy, id, name, displayName: name, handle: handle || copy.handle, logoText: copy.logoText || name.toUpperCase() };
  }
  const base = structuredClone(DEFAULT_PROFILES[0]);
  return { ...base, id, name, displayName: name, handle, website: "", logoText: name.toUpperCase(), logoSub: "", logoImage: undefined, headshot: undefined };
}

/**
 * The card a new, blank brand opens with: the default look, but neutral placeholder text instead of the sample post, and no
 * footer text, so nothing from another brand's cards shows. (The words differ from the old placeholder on purpose: that one
 * is replaced by the sample text when a card is loaded.)
 */
export function blankDesign(base: Design): Design {
  return { ...base, eyebrow: "Your topic", title: "Your headline\ngoes here", subtitle: "A short line that supports it", tag: "Series", footer: "", footerLeft: "" };
}

/** Which brand to open: the remembered one if it is still active, otherwise the first. */
export function pickActive(remembered: unknown, active: { id: string }[]): string | undefined {
  if (typeof remembered === "string" && active.some((p) => p.id === remembered)) return remembered;
  return active[0]?.id;
}

/** `ids` with `id` moved one place up or down. Returns the same order at either end. */
export function move(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = ids.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Up to two letters for a brand's badge. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/** The brand's accent colour, for its dot in lists: from the colour set its card uses, else its first. */
export function brandColor(profile: Profile, design?: Design): string {
  const pal = profile.palettes.find((p) => p.id === design?.paletteId) ?? profile.palettes[0];
  return pal?.accent ?? "#888888";
}

/** Why a new brand cannot be created with these inputs, or undefined. */
export function brandProblem(name: string, existing: { name: string }[]): string | undefined {
  const n = name.trim();
  if (!n) return "Give the brand a name.";
  if (n.length > 60) return "Keep the name under 60 characters.";
  if (existing.some((p) => p.name.trim().toLowerCase() === n.toLowerCase())) return "A brand with this name already exists.";
  return undefined;
}
