import type { Draft } from "./draft";
import { serializeDraft } from "./linkedin";
import type { Design } from "./types";

const WORDS = ["eyebrow", "title", "subtitle", "tag", "quoteAuthor", "statValue"] as const;

/** A card with the brand's look (layout, colours, background, footer, logo) and nothing written or placed on it. */
export function blankCard(base: Design): Design {
  const card: Design = { ...base, photos: [] };
  for (const w of WORDS) card[w] = "";
  delete card.screenshot;
  delete card.bgImage;
  delete card.caption;
  return card;
}

/** Whether nothing has been put into a draft yet, so starting fresh can use it again. */
export function isBlank(d: Draft): boolean {
  const c = d.design;
  return d.status === "draft" && !!c
    && !serializeDraft(d).text.trim() && !d.title && !d.altText && !d.summary && !d.hashtags.length
    && (d.attachment ?? "card") === "card" && !d.videoUrl
    && WORDS.every((w) => !c[w]) && !c.photos?.length && !c.screenshot && !c.bgImage;
}
