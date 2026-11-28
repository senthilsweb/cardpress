// How the application looks for the person: a colour theme, and light, dark or whatever the system uses. Cards are not
// affected: their colours are the brand's palette.
import { useSyncExternalStore } from "react";
import { api } from "./api";

export const THEMES = [
  { id: "parchment", name: "Parchment", hint: "Cream and deep green" },
  { id: "aubergine", name: "Aubergine", hint: "Deep purple frame" },
  { id: "cobalt", name: "Cobalt", hint: "Blue side bar, quiet and minimal" },
  { id: "graphite", name: "Graphite", hint: "Neutral grey" },
] as const;
export type ThemeId = (typeof THEMES)[number]["id"];
export type Mode = "light" | "dark" | "system";

export interface Appearance { theme: ThemeId; mode: Mode }

export const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
export const isMode = (v: unknown): v is Mode => v === "light" || v === "dark" || v === "system";
export const resolveMode = (mode: Mode, systemDark: boolean): "light" | "dark" => (mode === "system" ? (systemDark ? "dark" : "light") : mode);

/** What was saved, made whole: an unknown or missing value takes the default. */
export const readAppearance = (preferences: Record<string, unknown>): Appearance => ({
  theme: isTheme(preferences.palette) ? preferences.palette : "parchment",
  mode: isMode(preferences.theme) ? preferences.theme : "system",
});

// The server sets this cookie, so the first paint after a reload has the right colours (see Base.astro). It holds the
// colour theme and the mode, nothing else.
export const LOOK_COOKIE = "cardpress_look";
export const readLook = (cookies: string): Appearance => {
  const m = new RegExp(`(?:^|;\\s*)${LOOK_COOKIE}=([a-z]+)\\.([a-z]+)`).exec(cookies);
  return readAppearance({ palette: m?.[1], theme: m?.[2] });
};
const cached = (): Appearance => readLook(typeof document === "undefined" ? "" : document.cookie);

let current: Appearance | undefined;
const listeners = new Set<() => void>();
const media = () => (typeof window === "undefined" ? undefined : window.matchMedia("(prefers-color-scheme: dark)"));
const get = () => (current ??= cached());

function apply(a: Appearance) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveMode(a.mode, !!media()?.matches);
  document.documentElement.dataset.palette = a.theme;
}
function set(a: Appearance) {
  current = a;
  apply(a);
  listeners.forEach((l) => l());
}

/** Called once the server's preferences are loaded. */
export const hydrateAppearance = (preferences: Record<string, unknown>) => set(readAppearance(preferences));

// a failed save only means the choice is not remembered
export function setMode(mode: Mode) { set({ ...get(), mode }); api.putPreference("theme", mode).catch(() => undefined); }

/** Save a theme and a mode, and show them once the server has them. */
export async function saveAppearance(a: Appearance): Promise<void> {
  await api.putPreference("palette", a.theme);
  await api.putPreference("theme", a.mode);
  set(a);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const m = media();
  const follow = () => { apply(get()); current = { ...get() }; listener(); };
  m?.addEventListener("change", follow);
  return () => { listeners.delete(listener); m?.removeEventListener("change", follow); };
}

export function useAppearance(): Appearance & { shown: "light" | "dark" } {
  const a = useSyncExternalStore(subscribe, get, () => readAppearance({}));
  return { ...a, shown: resolveMode(a.mode, !!media()?.matches) };
}
