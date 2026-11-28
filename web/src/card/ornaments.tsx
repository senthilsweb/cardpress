import type { Design } from "@/lib/types";
import { ORNAMENT_BOX, type OrnamentDef } from "./ornamentkit";

/* Every card/ornament/**.tsx (not starting with "_") that default-exports an OrnamentDef, in file path order. */
export const ORNAMENTS: OrnamentDef[] = Object.entries(import.meta.glob<{ default: OrnamentDef }>("./ornament/**/*.tsx", { eager: true }))
  .filter(([path]) => !path.split("/").pop()!.startsWith("_"))
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, m]) => m.default)
  .filter((d) => d && d.id && d.id !== "none" && typeof d.render === "function");

export const DEFAULT_ORNAMENT = "heart";

/**
 * The ornament a card draws: an id, or "none". A card saved before ornaments could be picked has the heart flourish, or
 * none if it was switched off; so has one naming an ornament this app does not have.
 */
export function ornamentOf(design: Pick<Design, "ornament" | "noOrnament">): string {
  const id = design.ornament ?? (design.noOrnament ? "none" : DEFAULT_ORNAMENT);
  return id === "none" || ORNAMENTS.some((o) => o.id === id) ? id : DEFAULT_ORNAMENT;
}

/** All ornaments, those suiting the occasion first. */
export const ornamentsFor = (occasion?: string): OrnamentDef[] => {
  const suits = (o: OrnamentDef) => !!occasion && !!o.occasions?.includes(occasion);
  return [...ORNAMENTS.filter(suits), ...ORNAMENTS.filter((o) => !suits(o))];
};

/** One ornament as wide as asked; nothing for "none". */
export function Ornament({ id, colour, width }: { id: string; colour: string; width: number | string }) {
  const def = ORNAMENTS.find((o) => o.id === id);
  if (!def) return null;
  return (
    <svg width={width} viewBox={`0 0 ${ORNAMENT_BOX.w} ${ORNAMENT_BOX.h}`} style={{ display: "block", width, height: typeof width === "number" ? (width * ORNAMENT_BOX.h) / ORNAMENT_BOX.w : "auto" }} aria-hidden>
      {def.render({ width: typeof width === "number" ? width : ORNAMENT_BOX.w, colour })}
    </svg>
  );
}
