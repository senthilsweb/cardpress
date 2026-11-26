import type { Palette } from "@/lib/types";
import { isDark, mix } from "@/lib/color";

export const SEASONAL = "Seasonal greetings";

/** A festive colour that holds up on the palette: lifted a little on dark cards, deepened a little on light ones. */
export const tone = (p: Palette, colour: string) => (isDark(p.base) ? mix(colour, "#ffffff", 0.08) : mix(colour, "#000000", 0.06));
export const tones = (p: Palette, colours: string[]) => colours.map((c) => tone(p, c));

export const f = (n: number) => n.toFixed(1);
