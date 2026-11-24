import { useCallback, useEffect, useState } from "react";
import { api, ApiError, clearToken, getToken, setToken } from "./api";
import { DEFAULT_PROFILES, withStandardPalettes } from "./profiles";
import { brandColor, pickActive } from "./brands";
import type { Design, Profile } from "./types";
import { hydrateCustomFonts, type FontDef } from "./fonts";

export interface LibraryBoot {
  profiles: Profile[];
  activeId: string;
  theme?: "light" | "dark";
  colors: Record<string, string>;
  /** Each brand's own design: the card shown for an item that was never given one. */
  designs: Record<string, Design>;
}

export type LibraryBootState =
  | { status: "loading" }
  | { status: "auth"; error?: string }
  | { status: "error"; message: string }
  | { status: "ready"; data: LibraryBoot };

/** What the library page needs to start: the brands and which one is open. It reads only, so opening it creates nothing. */
export function useLibraryBoot() {
  const [boot, setBoot] = useState<LibraryBootState>({ status: "loading" });

  const load = useCallback(async () => {
    setBoot({ status: "loading" });
    try {
      const info = await api.info();
      if (info.authRequired && !getToken()) return setBoot({ status: "auth" });
      const state = await api.state();
      const profiles = (state.profiles as Profile[]).length ? withStandardPalettes(state.profiles as Profile[]) : DEFAULT_PROFILES;
      const activeId = pickActive(state.preferences.activeProfile, profiles) ?? profiles[0].id;
      const designs = state.designs as Record<string, Design>;
      const colors = Object.fromEntries(profiles.map((p) => [p.id, brandColor(p, designs[p.id])]));
      const theme = state.preferences.theme === "dark" || state.preferences.theme === "light" ? state.preferences.theme : undefined;
      const fonts = Array.isArray(state.preferences.customFonts) ? (state.preferences.customFonts as FontDef[]) : [];
      hydrateCustomFonts(fonts, (list) => { api.putPreference("customFonts", list).catch(() => undefined); });
      setBoot({ status: "ready", data: { profiles, activeId, theme, colors, designs } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { clearToken(); return setBoot({ status: "auth", error: "That token was not accepted." }); }
      setBoot({ status: "error", message: e instanceof Error ? e.message : "Something went wrong" });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitToken = (t: string) => { setToken(t.trim()); void load(); };
  return { boot, retry: load, submitToken };
}
