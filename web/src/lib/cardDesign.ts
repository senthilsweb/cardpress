import type { Design } from "./types";

/**
 * The design as the server stores it. Only the known fields are sent: the server refuses any other, and an older saved
 * design may carry leftovers (such as `caption`).
 */
export function toCardDesign(d: Design): Design {
  const out: Design = {
    sizeId: d.sizeId, layout: d.layout, background: d.background, paletteId: d.paletteId, seed: d.seed,
    eyebrow: d.eyebrow ?? "", title: d.title ?? "", subtitle: d.subtitle ?? "", footer: d.footer ?? "", tag: d.tag ?? "",
    quoteAuthor: d.quoteAuthor ?? "", statValue: d.statValue ?? "",
    titleScale: d.titleScale, intensity: d.intensity, bottomFade: d.bottomFade,
    showLogo: d.showLogo, showFooter: d.showFooter, photos: d.photos ?? [],
  };
  if (d.footerLeft) out.footerLeft = d.footerLeft;
  if (d.screenshot) out.screenshot = d.screenshot;
  if (d.bgImage) out.bgImage = d.bgImage;
  if (d.fonts && Object.keys(d.fonts).length) out.fonts = d.fonts;
  return out;
}
