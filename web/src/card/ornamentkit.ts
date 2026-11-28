import type { ReactNode } from "react";

/** The box every ornament is drawn in. It is shown as wide as asked, keeping this shape. */
export const ORNAMENT_BOX = { w: 270, h: 30 };

export interface OrnamentDef {
  id: string;
  name: string;
  /** Background groups it suits ("Diwali"): it is listed first for a card with one of those. */
  occasions?: string[];
  /** SVG elements inside the 270 × 30 box, in the given colour. `width` is how wide it will be shown. */
  render: (c: { width: number; colour: string }) => ReactNode;
}
