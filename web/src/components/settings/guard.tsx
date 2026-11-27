import { createContext, useContext, useEffect, useId, useRef } from "react";
import type { Holds } from "@/lib/holds";

export const Guard = createContext<Holds | null>(null);

/** While `dirty`, leaving the page (another page, closing the dialog) asks first. */
export function useUnsaved(dirty: boolean, question = "You have unsaved changes. Discard them?") {
  const holds = useContext(Guard);
  const id = useId();
  useEffect(() => {
    if (!holds || !dirty) return;
    holds.set(id, { ask: question });
    return () => holds.remove(id);
  }, [holds, id, dirty, question]);
}

/** Run `save` before the page is left, for a page that saves a moment after each change. */
export function useFlush(save: () => Promise<void>) {
  const holds = useContext(Guard);
  const id = useId();
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    if (!holds) return;
    holds.set(id, { flush: () => latest.current() });
    return () => holds.remove(id);
  }, [holds, id]);
}
