import type { ReactNode } from "react";
import type { BackgroundId, Palette } from "@/lib/types";
import { isDark, mix, hexToRgb } from "@/lib/color";
import type { Rng } from "@/lib/rng";

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type MaskKind = "right" | "top" | "bottom" | "none";

export interface BgCtx {
  W: number;
  H: number;
  u: number; // 1% of the short side
  area: Area; // where the art should concentrate
  mask: MaskKind;
  pal: Palette;
  rng: Rng;
  uid: string;
  photos: string[];
  screenshot?: string;
  image?: string;
}

export interface BackgroundDef {
  id: BackgroundId;
  name: string;
  hint: string;
  /** The list it appears in. Default "Abstract". */
  category?: string;
  /** A heading inside the category, for variations of one theme. */
  group?: string;
  /** Other words the search finds it by. */
  keywords?: string[];
  /** Id of a standard palette that suits it, offered in the picker. */
  palette?: string;
  needs?: "photos" | "screenshot" | "image";
  /** Dense art: the card clears a strip behind the footer, and behind the logo where the art runs under it. */
  dense?: boolean;
  /** The art frames the card and leaves its middle clear, so no wash is laid behind centred words. */
  frames?: boolean;
  render: (c: BgCtx) => ReactNode;
}

/* helpers shared by built-in and drop-in backgrounds */
export const ink = (p: Palette, a: number) => {
  const [r, g, b] = hexToRgb(p.text);
  return `rgba(${r},${g},${b},${a})`;
};
export const surface = (p: Palette) => (isDark(p.base) ? mix(p.base, "#ffffff", 0.07) : mix(p.base, "#000000", 0.05));

