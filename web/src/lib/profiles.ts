import type { Design, Palette, Profile } from "./types";

const p = (id: string, name: string, base: string, fade: string, accent: string, text: string, sub: string): Palette => ({
  id, name, base, fade, accent, text, sub,
});

/** senthilsweb.com palettes: paper / ink / green, plus the deep-teal cover style. */
const personalPalettes: Palette[] = [
  p("paper", "Paper", "#f5f2ea", "#e6e1d6", "#1f7a55", "#1a1712", "#1f7a55"),
  p("ink", "Ink", "#16130e", "#2d271e", "#3da878", "#ece5d8", "#3da878"),
  p("deep-teal", "Deep teal", "#0a1416", "#0e2124", "#0d7377", "#f2f5f4", "#e0a030"),
  p("teal-paper", "Teal paper", "#f4f7f6", "#dbe7e5", "#0d7377", "#10292b", "#0d7377"),
];

// Brochure palettes: eight colour sets, each expanded to a dark and a light variant.
const BROCHURE: [string, string, string, string, string, string, string, string][] = [
  // id, name, primary, tint, secondary, highlight, hair, body
  ["aubergine", "Aubergine", "#4A154B", "#F7F2F7", "#0A63DD", "#F0B84D", "#DED6DE", "#B384DC"],
  ["yellow-green", "Yellow green", "#063B36", "#FFF3D1", "#00574B", "#F9B800", "#E6DDBF", "#F9B800"],
  ["emerald", "Emerald", "#0B4F3F", "#F0F5F2", "#1B7F5C", "#D6B85F", "#D3DED9", "#3DAE85"],
  ["navy-violet", "Navy violet", "#07152F", "#F0F2F6", "#5B48D8", "#16D9FF", "#D6DAE2", "#8C7CF0"],
  ["deepblue-coral", "Deep blue coral", "#164B62", "#F0F5F7", "#D84B2E", "#FFAD4D", "#D4DEE3", "#5FB0CF"],
  ["indigo-lime", "Indigo lime", "#17163B", "#F1F1F6", "#4A56E8", "#8FBF2F", "#D7D6E2", "#8FBF2F"],
  ["charcoal-teal", "Charcoal teal", "#101515", "#F1F3F3", "#0E8F82", "#E7B94D", "#D9DEDD", "#2DB5A7"],
  ["deepblue-sky", "Deep blue sky", "#0B2E59", "#EFF3F8", "#1D6FD8", "#38BDF8", "#D3DBE6", "#5AB8F0"],
];
const brochurePalettes: Palette[] = BROCHURE.flatMap(([id, name, primary, tint, secondary, highlight, hair, body]) => [
  p(id, `${name} · dark`, primary.toLowerCase(), "#000000", body.toLowerCase(), "#ffffff", highlight.toLowerCase()),
  p(`${id}-light`, `${name} · light`, tint.toLowerCase(), hair.toLowerCase(), body.toLowerCase(), primary.toLowerCase(), secondary.toLowerCase()),
]).map((pl) => (pl.fade === "#000000" ? { ...pl, fade: blend(pl.base, pl.accent, 0.55) } : pl));

// Cover palettes: eight colour sets for article and promo covers.
const COVER: [string, string, string, string, string, string, string, boolean][] = [
  // id, name, background, primary, secondary, accent, soft, dark
  ["cream-emerald", "Cream emerald", "#F8F2E6", "#062E2B", "#0B6B55", "#D8C98A", "#BFD8C8", false],
  ["deep-navy-cyan-violet", "Deep navy cyan violet", "#061326", "#F8FAFC", "#38DDF5", "#8B5CF6", "#1E40AF", true],
  ["blue-pink-gloss", "Blue pink gloss", "#F8F5EE", "#071C3A", "#2563EB", "#EC4899", "#C7D2FE", false],
  ["dark-neon-pink-blue", "Dark neon pink blue", "#050B1E", "#FFFFFF", "#38BDF8", "#F472B6", "#7C3AED", true],
  ["privacy-orange-coral", "Privacy orange coral", "#FFF7ED", "#111827", "#F97316", "#EF4444", "#FDBA74", false],
  ["light-blue-purple", "Light blue purple", "#EAF6FF", "#071C3A", "#2563EB", "#7C3AED", "#67E8F9", false],
  ["charcoal-gold-teal", "Charcoal gold teal", "#07110F", "#F8FAFC", "#14B8A6", "#FBBF24", "#2DD4BF", true],
  ["soft-slate-copper", "Soft slate copper", "#F6F1EA", "#1E293B", "#475569", "#B77945", "#CBD5E1", false],
];
const coverPalettes: Palette[] = COVER.map(([id, name, bg, primary, secondary, accent, soft, dark]) =>
  p(id, name, bg.toLowerCase(), blend(bg.toLowerCase(), soft.toLowerCase(), dark ? 0.25 : 0.5), accent.toLowerCase(), primary.toLowerCase(), secondary.toLowerCase())
);

// Seasonal palettes, to go with the seasonal greeting backgrounds.
const seasonalPalettes: Palette[] = [
  p("autumn-cream", "Autumn cream", "#fbf3e4", "#f0dcb8", "#c2561b", "#3a1f0f", "#9a3412"),
  p("autumn-night", "Autumn night", "#24140c", "#4a2413", "#e8792b", "#fbeeda", "#f4b04a"),
  p("festival-night", "Festival night", "#1c0f33", "#3d1a52", "#f59e0b", "#fdf4e3", "#fbbf24"),
  p("midnight-gold", "Midnight gold", "#070b1a", "#131d3d", "#d4a52c", "#f6f3ea", "#f1cf6b"),
  p("lunar-red", "Lunar red", "#8e0f16", "#5c070c", "#f2b632", "#fff3da", "#ffd873"),
];

/** Standard theme: every palette is available to every profile. */
export const standardPalettes: Palette[] = [...personalPalettes, ...coverPalettes, ...brochurePalettes, ...seasonalPalettes];

function blend(a: string, b: string, t: number) {
  const f = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = f(a), B = f(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export const DEFAULT_PROFILES: Profile[] = [
  {
    id: "personal",
    name: "Personal",
    displayName: "Senthilnathan",
    handle: "@senthilsweb",
    website: "www.senthilsweb.com",
    logoText: "SENTHILSWEB",
    logoSub: "",
    mark: "diamond",
    displayFont: "Space Grotesk Variable",
    bodyFont: "Space Grotesk Variable",
    palettes: standardPalettes,
  },
];

/**
 * The sample card a new design starts with. It is the text of a real post ("Many Questions. One SQL Row.", from the
 * author's LinkedIn series), so a fresh card looks like a finished one and shows every part: eyebrow, title, subtitle,
 * and a footer with a left and a right link.
 */
export const SAMPLE_TEXT = {
  eyebrow: "Adaptive Data Gov · AI System One",
  title: "Many Questions.\nOne SQL Row.",
  subtitle: "An AI function that works row by row",
  footerLeft: "senthilsweb.com/jev-pii",
  footer: "github.com/senthilsweb/jev-pii",
  tag: "AI System One",
  statValue: "1",
} as const;

/** What the card said before the sample above: untouched placeholder text. */
const OLD_PLACEHOLDER = { eyebrow: "Data & AI · Open source", title: "Your headline goes here", subtitle: "Short supporting line | second point | third point" };

export const DEFAULT_DESIGN: Design = {
  sizeId: "li-post",
  layout: "hero",
  background: "mesh",
  paletteId: "cream-emerald",
  seed: 7,
  ...SAMPLE_TEXT,
  quoteAuthor: "",
  titleScale: 1,
  intensity: 0.9,
  bottomFade: 0,
  showLogo: true,
  showFooter: true,
  photos: [],
};

/**
 * A saved card whose text is still the old placeholder was never written on: give it the sample text instead.
 * Anything the user has typed is left alone, and so are their layout, colours and background.
 */
export function upgradePlaceholderText(d: Design): Design {
  const untouched = d.title === OLD_PLACEHOLDER.title && d.eyebrow === OLD_PLACEHOLDER.eyebrow && d.subtitle === OLD_PLACEHOLDER.subtitle;
  return untouched ? { ...d, ...SAMPLE_TEXT } : d;
}

/**
 * Saved profiles predate newer palettes: append any standard palette whose id is missing, keep the user's edits.
 */
export function withStandardPalettes(saved: Profile[]): Profile[] {
  if (!saved.length) return DEFAULT_PROFILES;
  return completeProfiles(saved);
}

/** The same for a list that may be empty (archived brands): an empty list stays empty. */
export function completeProfiles(saved: Profile[]): Profile[] {
  return saved.map((one) => {
    // a profile saved by something other than the studio (the API, a script) may lack fields: fill them from the default
    const pr: Profile = { ...DEFAULT_PROFILES[0], ...one, palettes: Array.isArray(one.palettes) ? one.palettes : [] };
    const have = new Set(pr.palettes.map((pal) => pal.id));
    const missing = standardPalettes.filter((pal) => !have.has(pal.id));
    return missing.length ? { ...pr, palettes: [...pr.palettes, ...missing] } : pr;
  });
}
