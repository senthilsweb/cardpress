/**
 * The app's side of a sign-in that ends without use. The server decides when it ends; this only tells it that someone is
 * using the app, and warns before the end. What to do now is worked out here, apart from the screen.
 */
export interface IdleState {
  /** When the person last typed, clicked or moved. */
  used: number;
  /** When the server was last told. */
  told: number;
  /** When the server says the session ends, and why. */
  ends: number;
  limit: "idle" | "max";
}

/** The server is told about use at most this often. */
export const TELL_EVERY = 60_000;
/** The warning shows when this much is left. */
export const WARN_AT = 60_000;

/**
 * - `tell`: someone used the app since the server last heard; say so, which starts the idle time again.
 * - `ask`: the end is near; ask the server how long is left, as another tab may have been in use.
 */
export function idleStep(s: IdleState, now: number): "tell" | "ask" | "wait" {
  const near = s.ends - now <= WARN_AT * 2;
  if (s.used > s.told && (now - s.told >= TELL_EVERY || near) && s.limit === "idle") return "tell";
  return near ? "ask" : "wait";
}

/** Seconds to show in the warning, or null while there is time. */
export function warning(s: Pick<IdleState, "ends">, now: number): number | null {
  const left = s.ends - now;
  return left <= WARN_AT ? Math.max(0, Math.ceil(left / 1000)) : null;
}
