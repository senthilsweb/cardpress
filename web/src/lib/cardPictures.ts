import { BACKGROUNDS, bgById } from "@/card/backgrounds";
import type { Design } from "./types";

/** The three kinds of picture a card can hold, named as a background's `needs`. */
export type PictureKind = "photos" | "screenshot" | "image";

const held = (d: Partial<Design>, kind: PictureKind): string[] =>
  kind === "photos" ? d.photos ?? [] : [(kind === "screenshot" ? d.screenshot : d.bgImage) ?? ""].filter(Boolean);

/** The Split layout draws the first photo as the headshot when the brand has none. */
const isHeadshot = (d: Design, kind: PictureKind, hasHeadshot: boolean) => kind === "photos" && d.layout === "split" && !hasHeadshot;

/** Whether the card draws this kind of picture as it is set up now. */
export const drawsPicture = (d: Design, kind: PictureKind, hasHeadshot: boolean): boolean =>
  bgById(d.background).needs === kind || isHeadshot(d, kind, hasHeadshot);

/** The background that shows this kind of picture. */
export const backgroundShowing = (kind: PictureKind) =>
  BACKGROUNDS.find((b) => b.id === (kind === "photos" ? "mosaic" : kind === "screenshot" ? "browser" : "image")) ?? BACKGROUNDS.find((b) => b.needs === kind)!;

/**
 * The background a change of pictures should bring with it, so that an added picture is seen at once. Nothing when
 * no picture was added (one removed, say), or when the card already draws it.
 */
export function backgroundFor(design: Design, patch: Partial<Design>, hasHeadshot: boolean): string | undefined {
  for (const kind of ["image", "screenshot", "photos"] as const) {
    const before = held(design, kind);
    if (!held(patch, kind).some((v) => !before.includes(v))) continue;
    if (!drawsPicture({ ...design, ...patch }, kind, hasHeadshot)) return backgroundShowing(kind).id;
  }
  return undefined;
}
