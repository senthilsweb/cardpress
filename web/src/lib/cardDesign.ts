import type { Design } from "./types";

const NO_WORDS = { eyebrow: "", title: "", subtitle: "", footer: "", footerLeft: "", tag: "", quoteAuthor: "", statValue: "", signature: "" };

/** A saved design made whole. Settings it lacks come from `base`; words it lacks stay empty, never `base`'s. */
export const fullDesign = (base: Design, saved: Partial<Design>): Design => ({ ...base, ...NO_WORDS, noFooter: false, noFooterLeft: false, ...saved });

/** A change to a card. Writing a footer decides its flag: emptied by hand means no text, not the brand's own. */
export function withFooterFlags(patch: Partial<Design>): Partial<Design> {
  const out = { ...patch };
  if (out.footer !== undefined && out.noFooter === undefined) out.noFooter = out.footer === "";
  if (out.footerLeft !== undefined && out.noFooterLeft === undefined) out.noFooterLeft = out.footerLeft === "";
  return out;
}

/**
 * The design as the server stores it. Only the known fields are sent: the server refuses any other, and an older saved
 * design may carry leftovers (such as `caption`).
 */
export function toCardDesign(d: Design): Design {
  const out: Design = {
    sizeId: d.sizeId, layout: d.layout, background: d.background, paletteId: d.paletteId, seed: d.seed,
    eyebrow: d.eyebrow ?? "", title: d.title ?? "", subtitle: d.subtitle ?? "", footer: d.footer ?? "", tag: d.tag ?? "",
    quoteAuthor: d.quoteAuthor ?? "", statValue: d.statValue ?? "", footerLeft: d.footerLeft ?? "",
    titleScale: d.titleScale, intensity: d.intensity, bottomFade: d.bottomFade,
    showLogo: d.showLogo, showFooter: d.showFooter, photos: d.photos ?? [],
  };
  if (d.signature) out.signature = d.signature;
  if (d.ornament) out.ornament = d.ornament;
  else if (d.noOrnament) out.noOrnament = true;
  if (d.noFooter) out.noFooter = true;
  if (d.noFooterLeft) out.noFooterLeft = true;
  if (d.screenshot) out.screenshot = d.screenshot;
  if (d.bgImage) out.bgImage = d.bgImage;
  if (d.fonts && Object.keys(d.fonts).length) out.fonts = d.fonts;
  return out;
}
