import { useEffect, useState } from "react";
import { api } from "./api";
import type { Draft } from "./draft";
import { mediaOf } from "./media";
import { usePictures } from "./usePictures";

/** What the open post carries, with addresses the page can show it from. Previews and the editor share one of these. */
export function usePostMedia(draft: Draft | null | undefined) {
  const media = mediaOf(draft);
  const { kind } = media;
  const pics = kind === "images" ? draft?.images ?? [] : [];
  const picUrls = usePictures(kind === "images" ? draft?.id : undefined, pics.map((p) => p.id));
  const [file, setFile] = useState<string | undefined>();
  useEffect(() => {
    setFile(undefined);
    if ((kind !== "image" && kind !== "document") || !draft) return;
    let live = true, url: string | undefined;
    api.attachmentImage(draft.id).then((b) => { if (live) { url = URL.createObjectURL(b); setFile(url); } }).catch(() => undefined);
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [kind, draft?.id, draft?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = pics.map((p) => picUrls[p.id]).filter(Boolean);
  /** What FeedFrame needs to show the post's own file; empty for a card. */
  const frame = {
    mediaSrc: kind === "images" ? (list.length === 1 ? list[0] : undefined) : kind === "image" || kind === "document" ? file : undefined,
    mediaList: kind === "images" && list.length > 1 ? list : undefined,
    documentTitle: kind === "document" ? draft?.attachmentTitle ?? "" : undefined,
    videoSrc: kind === "video" ? draft?.videoUrl : undefined,
    videoTitle: draft?.attachmentTitle,
  };
  return { media, frame, file, picUrls };
}
export type PostMediaView = ReturnType<typeof usePostMedia>;
