import type { Draft } from "./draft";
import { NETWORKS, type Network } from "./sizes";

/** What a post goes out with, as far as a network cares: the kind, how many pictures, and the largest file. */
export interface PostMedia {
  kind: "card" | "image" | "images" | "document" | "video";
  count: number;
  /** Bytes of the largest file; 0 when not known. A card is drawn to fit, so it is not measured. */
  largest: number;
}

export function mediaOf(draft: Draft | null | undefined): PostMedia {
  const kind = draft?.kind === "post" ? draft.attachment ?? "card" : "card";
  if (kind === "images") {
    const pics = draft?.images ?? [];
    return { kind, count: pics.length, largest: Math.max(0, ...pics.map((p) => p.size ?? 0)) };
  }
  return { kind, count: kind === "card" ? 0 : 1, largest: (kind === "video" ? draft?.videoSize : draft?.attachmentSize) ?? 0 };
}

const MB = 1 << 20;

/**
 * What each network accepts in one post, from its developer documentation (checked 2026-11-25). Only LinkedIn is published
 * to by CardPress; for the others this decides which previews are shown.
 *   X: up to 4 photos or 1 video, 5 MB a photo; no documents listed.
 *   Instagram: photos up to 8 MB, 20 in a carousel, video up to 300 MB; no documents.
 *   Facebook Pages: photos up to 10 MB, several allowed, video; no document posts documented.
 */
const RULES: Record<Exclude<Network, "LinkedIn">, { document: false; pictures: number; picture: number; video: number }> = {
  X: { document: false, pictures: 4, picture: 5 * MB, video: Infinity },
  Instagram: { document: false, pictures: 20, picture: 8 * MB, video: 300 * MB },
  Facebook: { document: false, pictures: Infinity, picture: 10 * MB, video: Infinity },
};

/** Why a network cannot take this post, or null when it can. */
export function whyNot(net: Network, m: PostMedia): string | null {
  if (net === "LinkedIn" || m.kind === "card") return null;
  const r = RULES[net];
  if (m.kind === "document") return "no PDF posts";
  if (m.kind === "video") return m.largest > r.video ? `video over ${r.video / MB} MB` : null;
  if (m.count > r.pictures) return `${r.pictures} images at most`;
  return m.largest > r.picture ? `image over ${r.picture / MB} MB` : null;
}

/** The networks that cannot take this post, with the reason. */
export const leftOut = (m: PostMedia) => NETWORKS.flatMap((net) => { const why = whyNot(net, m); return why ? [{ net, why }] : []; });
