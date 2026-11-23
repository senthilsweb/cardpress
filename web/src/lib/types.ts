export interface Palette {
  id: string;
  name: string;
  base: string; // background
  fade: string; // soft surface / bottom fade
  accent: string; // tiles, marks, highlights
  text: string; // title text
  sub: string; // eyebrow, subtitle accents
}

export type MarkKind = "diamond" | "initial" | "image" | "none";
/** A font family name: a bundled one ("Inter Variable") or any Google Fonts family ("Fraunces"). See lib/fonts.ts. */
export type FontChoice = string;
export type FontRole = "title" | "body" | "label" | "logo" | "stat";

export interface Profile {
  id: string;
  name: string; // profile label in the switcher
  displayName: string; // shown in feed preview
  handle: string;
  website: string;
  logoText: string;
  logoSub: string; // small line next to the logo text
  logoSubPos?: "above" | "below"; // default above
  mark: MarkKind;
  logoImage?: string;
  headshot?: string;
  displayFont: FontChoice;
  bodyFont: FontChoice;
  labelFont?: FontChoice; // eyebrow, footer, tag, author (default JetBrains Mono)
  logoFont?: FontChoice; // default: same as labels
  statFont?: FontChoice; // default: same as titles
  palettes: Palette[];
}

export type LayoutId = "hero" | "center" | "quote" | "stat" | "split" | "cover";
/** Built-ins plus anything dropped into card/bg/. */
export type BackgroundId = string;

export interface Design {
  sizeId: string;
  layout: LayoutId;
  background: BackgroundId;
  paletteId: string;
  seed: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Bottom-right text. Empty = the profile's handle. */
  footer: string;
  /** Bottom-left text. Empty = the profile's website. */
  footerLeft?: string;
  tag: string;
  quoteAuthor: string;
  statValue: string;
  /** Legacy: captions now live in drafts. Read once to migrate, never written. */
  caption?: string;
  titleScale: number;
  intensity: number; // art strength 0..1
  bottomFade: number; // 0..1
  showLogo: boolean;
  showFooter: boolean;
  photos: string[];
  screenshot?: string;
  bgImage?: string;
  fonts?: Partial<Record<FontRole, FontChoice>>; // per-card overrides of the profile fonts
}
