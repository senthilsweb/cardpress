import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useState whose changes are saved through `save` (debounced). The initial value comes from the server, so nothing
 * is written until the user changes something. A failed save sets `saveError`; the next change retries.
 */
export function useSyncedState<T>(initial: T, save: (value: T) => Promise<void>, delayMs = 400) {
  const [value, setValue] = useState<T>(initial);
  const [saveError, setSaveError] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;

  const set = useCallback((next: T | ((prev: T) => T)) => {
    dirty.current = true;
    setValue(next);
  }, []);

  useEffect(() => {
    if (!dirty.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      dirty.current = false;
      saveRef.current(value).then(() => setSaveError(false), () => { dirty.current = true; setSaveError(true); });
    }, delayMs);
    return () => window.clearTimeout(timer.current);
  }, [value, delayMs]);

  return [value, set, saveError] as const;
}
