import { createContext, useContext, useEffect, useId, useRef } from "react";
import type { Holds } from "@/lib/holds";

export const Guard = createContext<Holds | null>(null);

/** While `dirty`, leaving the page (another page, closing the dialog, a reload) asks first. */
export function useUnsaved(dirty: boolean, question = "You have unsaved changes. Discard them?") {
  const holds = useContext(Guard);
  const id = useId();
  useEffect(() => {
    if (!holds || !dirty) return;
    holds.set(id, { ask: question });
    return () => holds.remove(id);
  }, [holds, id, dirty, question]);
  // reloading or closing the tab asks too, in the browser's own words
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => {
      if (holds?.agreed) return;
      e.preventDefault(); e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [holds, dirty]);
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
