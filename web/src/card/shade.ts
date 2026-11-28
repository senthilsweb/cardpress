import { rgba } from "@/lib/color";
import type { Design, LayoutId } from "@/lib/types";

/** How much a newly added background picture is shaded behind the words. */
export const DEFAULT_SHADE = 0.7;

/** Whether the card's background is a picture of one's own, filling it. */
export const fillsCard = (d: Pick<Design, "background" | "bgImage">): boolean => d.background === "image" && !!d.bgImage;

/** Whether a greeting lays a wash over the card's art, behind its words. Framing art and plain colour need none. */
export const washesArt = (d: Pick<Design, "layout" | "background" | "bgImage">, frames?: boolean): boolean =>
  d.layout === "greeting" && !fillsCard(d) && !frames && d.background !== "plain";

/** That wash for a shade the person set: smaller and lighter than the one older cards keep. Nothing at 0. */
export function greetingWash(colour: string, shade: number): string | null {
  const s = Math.min(Math.max(shade, 0), 1);
  if (s === 0) return null;
  const a = (part: number) => rgba(colour, Math.round(Math.min(s * part, 1) * 1000) / 1000);
  return `radial-gradient(ellipse 64% 56% at 50% 50%, ${a(1.15)} 0%, ${a(0.86)} 55%, ${a(0)} 100%)`;
}

export interface ShadePlace {
  layout: LayoutId;
  /** A wide card, with words on the left. */
  land: boolean;
  /** Where the words start on a square or tall card, as a part of its height. */
  textTop: number;
  logo: boolean;
  footer: boolean;
}

/**
 * The shading over one's own picture, as CSS backgrounds in the order they are laid on: behind the words wherever the
 * layout puts them, and more lightly behind the logo and the footer. At 0 there is none, and the picture is untouched.
 */
export function shadeLayers(colour: string, shade: number, at: ShadePlace): string[] {
  const s = Math.min(Math.max(shade, 0), 1);
  if (s === 0) return [];
  const a = (part: number) => rgba(colour, Math.round(s * part * 1000) / 1000);
  const pct = (v: number) => `${Math.round(Math.min(Math.max(v, 0), 1) * 100)}%`;
  const centred = at.layout === "center" || at.layout === "quote" || at.layout === "greeting";
  const wide = at.layout === "greeting" ? "80% 70%" : "72% 58%";
  const words = centred
    ? `radial-gradient(ellipse ${wide} at 50% 50%, ${a(1)} 0%, ${a(0.85)} 55%, ${a(0)} 100%)`
    : at.land
      ? `linear-gradient(90deg, ${a(1)} 0%, ${a(0.9)} 45%, ${a(0)} 72%)`
      : `linear-gradient(180deg, ${a(0)} ${pct(at.textTop - 0.22)}, ${a(0.85)} ${pct(at.textTop)}, ${a(1)} 100%)`;
  const out = [words];
  if (at.logo) out.push(`linear-gradient(180deg, ${a(0.75)} 0%, ${a(0)} 18%)`);
  // on a square or tall card the shading behind the words already reaches the foot
  if (at.footer && (centred || at.land)) out.push(`linear-gradient(0deg, ${a(0.75)} 0%, ${a(0)} 12%)`);
  return out;
}
