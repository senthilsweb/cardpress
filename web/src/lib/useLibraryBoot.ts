import { useCallback, useEffect, useState } from "react";
import { api, ApiError, clearToken, getToken, setToken } from "./api";
import { withStandardPalettes } from "./profiles";
import { hydratePrefs } from "./prefs";
import { createFirstBrand } from "./firstBrand";
import { brandColor, pickActive } from "./brands";
import type { Design, Profile } from "./types";
import { requireSession } from "./gate";
import { hydrateAppearance } from "./appearance";
import type { Session } from "./session";
import { hydrateCustomFonts, type FontDef } from "./fonts";

export interface LibraryBoot {
  profiles: Profile[];
  activeId: string;
  colors: Record<string, string>;
  session: Session;
  /** Each brand's own design: the card shown for an item that was never given one. */
  designs: Record<string, Design>;
}

export type LibraryBootState =
  | { status: "loading" }
  | { status: "auth"; error?: string }
  | { status: "error"; message: string }
  | { status: "ready"; data: LibraryBoot };

/**
 * What a page outside the studio needs to start: the brands and which one is open. It writes only for someone with no
 * brand yet, whose first one it saves.
 */
export function useLibraryBoot() {
  const [boot, setBoot] = useState<LibraryBootState>({ status: "loading" });

  const load = useCallback(async () => {
    setBoot({ status: "loading" });
    try {
      const info = await api.info();
      const session = await requireSession(info);
      if (!session) return; // being sent to sign in
      if (!info.accounts && info.authRequired && !getToken()) return setBoot({ status: "auth" });
      let state = await api.state();
      if (!state.profiles.length) {
        await createFirstBrand(session.user);
        state = await api.state();
      }
      const profiles = withStandardPalettes(state.profiles as Profile[]);
      const activeId = pickActive(state.preferences.activeProfile, profiles) ?? profiles[0].id;
      const designs = state.designs as Record<string, Design>;
      const colors = Object.fromEntries(profiles.map((p) => [p.id, brandColor(p, designs[p.id])]));
      hydrateAppearance(state.preferences);
      hydratePrefs(state.preferences);
      const fonts = Array.isArray(state.preferences.customFonts) ? (state.preferences.customFonts as FontDef[]) : [];
      hydrateCustomFonts(fonts, (list) => { api.putPreference("customFonts", list).catch(() => undefined); });
      setBoot({ status: "ready", data: { profiles, activeId, colors, designs, session } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { clearToken(); return setBoot({ status: "auth", error: "That token was not accepted." }); }
      setBoot({ status: "error", message: e instanceof Error ? e.message : "Something went wrong" });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitToken = (t: string) => { setToken(t.trim()); void load(); };
  return { boot, retry: load, submitToken };
}
