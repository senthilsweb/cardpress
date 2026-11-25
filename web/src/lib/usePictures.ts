import { useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Addresses the page can show for a post's pictures, by picture id. A picture's bytes never change under its id, so each
 * is fetched once and kept until the draft is left.
 */
export function usePictures(draftId: string | undefined, ids: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const made = useRef<{ draft?: string; urls: Record<string, string> }>({ urls: {} });
  const key = ids.join(",");

  useEffect(() => {
    if (made.current.draft !== draftId) { // another draft: let the old pictures go
      Object.values(made.current.urls).forEach((u) => URL.revokeObjectURL(u));
      made.current = { draft: draftId, urls: {} };
      setUrls({});
    }
    if (!draftId) return;
    let live = true;
    for (const id of ids) {
      if (made.current.urls[id]) continue;
      api.draftImage(draftId, id).then((b) => {
        if (!live || made.current.draft !== draftId || made.current.urls[id]) return;
        made.current.urls[id] = URL.createObjectURL(b);
        setUrls({ ...made.current.urls });
      }).catch(() => undefined);
    }
    return () => { live = false; };
  }, [draftId, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { Object.values(made.current.urls).forEach((u) => URL.revokeObjectURL(u)); }, []);
  return urls;
}
