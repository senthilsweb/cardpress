/**
 * How a person likes the screens: list or grid, which columns, page sizes and the like. Saved with the person on the
 * server, so it follows them to another browser; nothing is kept in this one. Loaded with the app, then held here.
 */
import { api } from "./api";

let held: Record<string, unknown> = {};
let saving: Promise<unknown> = Promise.resolve();

/** Called once the server's preferences are loaded. */
export function hydratePrefs(preferences: Record<string, unknown>) {
  const ui = preferences.ui;
  held = ui && typeof ui === "object" && !Array.isArray(ui) ? { ...(ui as Record<string, unknown>) } : {};
}

/** A saved choice, or undefined. The caller checks that it is one it knows. */
export const readPref = (key: string): unknown => held[key];

/** Remember a choice. A failed save only means it is not remembered. */
export function savePref(key: string, value: unknown) {
  if (JSON.stringify(held[key]) === JSON.stringify(value)) return;
  held = { ...held, [key]: value };
  const all = held;
  saving = saving.then(() => api.putPreference("ui", all)).catch(() => undefined); // one at a time, so the last one wins
}
