/**
 * Typing stays inside the editor and the document is handed on after a short pause. Every handing-on re-draws the studio and
 * works the text out again, which costs far more than the keystroke itself. Anything that reads the saved document (preview,
 * copy, approve, switching drafts, leaving) calls flushPendingEdits() first, so it never sees text that is a moment old.
 */

export interface Trailing<T> {
  /** Remember the latest value and run after `ms` without another push. */
  push: (v: T) => void;
  /** Run now with the latest value, if there is one waiting. */
  flush: () => void;
  pending: () => boolean;
}

export function createTrailing<T>(run: (v: T) => void, ms: number): Trailing<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let has = false;
  let last: T;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!has) return;
    has = false;
    run(last);
  };
  return {
    push: (v) => { last = v; has = true; clearTimeout(timer); timer = setTimeout(flush, ms); },
    flush,
    pending: () => has,
  };
}

const flushers = new Set<() => void>();

/** An editor registers its flush while it is on screen. Returns the way to stop. */
export function registerFlusher(fn: () => void): () => void {
  flushers.add(fn);
  return () => { flushers.delete(fn); };
}

export function flushPendingEdits() {
  for (const f of [...flushers]) f();
}
