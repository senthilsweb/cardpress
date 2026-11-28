import { hydrateAppearance } from "./appearance";
import { hydratePrefs } from "./prefs";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, clearToken, getToken, setToken } from "./api";
import { DEFAULT_PROFILES, completeProfiles, upgradePlaceholderText, withStandardPalettes } from "./profiles";
import { pickActive } from "./brands";
import { createFirstBrand } from "./firstBrand";
import { docFromPlainText, EMPTY_DOC, type Draft } from "./draft";
import type { Design, Profile } from "./types";
import type { FontDef } from "./fonts";
import { parseLayout, type Layout } from "./layout";
import { requireSession } from "./gate";
import type { Session } from "./session";

/** What the studio needs to start. */
export interface Loaded {
  /** Every active brand, in order. */
  profiles: Profile[];
  /** Brands hidden from the studio but kept with their history. */
  archived: Profile[];
  /** The brand that is open. */
  activeId: string;
  designs: Record<string, Design>;
  customFonts: FontDef[];
  drafts: Draft[];
  layout: Layout;
  /** Who is signed in and what their role allows. */
  session: Session;
}

export type Boot =
  | { status: "loading" }
  | { status: "auth"; error?: string }
  | { status: "error"; message: string }
  | { status: "ready"; data: Loaded };

/** The caption the app used to ship with; it is a placeholder, not something the user wrote. */
const OLD_PLACEHOLDER_CAPTION = "Write your post caption here.\n\nCharacter limits for each platform are shown below.";

/**
 * The studio always has a draft to edit. The first one is made here, carrying over any caption the user wrote
 * in the older version (it lived in the design).
 */
async function loadDrafts(profileId: string, design: Design | undefined): Promise<Draft[]> {
  const existing = await api.listDrafts(profileId);
  if (existing.length) return existing;
  const old = (design?.caption ?? "").trim();
  const doc = old && old !== OLD_PLACEHOLDER_CAPTION.trim() ? docFromPlainText(old) : EMPTY_DOC;
  return [await api.createDraft({ profileId, kind: "post", doc, hashtags: [], altText: "", unicodeStyles: false })];
}

function fromState(s: Awaited<ReturnType<typeof api.state>>, drafts: Draft[], activeId: string, session: Session): Loaded {
  const profiles = (s.profiles as Profile[]).length ? withStandardPalettes(s.profiles as Profile[]) : DEFAULT_PROFILES;
  const archived = Array.isArray(s.archived) ? completeProfiles(s.archived as Profile[]) : [];
  hydrateAppearance(s.preferences);
  hydratePrefs(s.preferences);
  const fonts = Array.isArray(s.preferences.customFonts) ? (s.preferences.customFonts as FontDef[]) : [];
  const designs = Object.fromEntries(Object.entries(s.designs as Record<string, Design>).map(([k, d]) => [k, upgradePlaceholderText(d)]));
  return { profiles, archived, activeId, designs, customFonts: fonts, drafts, layout: parseLayout(s.preferences.layout), session };
}

export function useBoot() {
  const [boot, setBoot] = useState<Boot>({ status: "loading" });
  const sessionRef = useRef<Session>({ perms: [] });

  const load = useCallback(async () => {
    setBoot({ status: "loading" });
    try {
      const info = await api.info();
      const session = await requireSession(info);
      if (!session) return; // being sent to sign in
      if (!info.accounts && info.authRequired && !getToken()) return setBoot({ status: "auth" });
      let state = await api.state();
      if (!state.profiles.length) {
        // someone new: their first brand is saved now, so the server knows it (accounts and posts are kept per brand)
        await createFirstBrand(session.user);
        state = await api.state();
      }
      // another page (the library) can open a given brand: /studio/?brand=<id>
      const asked = new URLSearchParams(window.location.search).get("brand");
      const pid = pickActive(asked || state.preferences.activeProfile, state.profiles as Profile[]) ?? DEFAULT_PROFILES[0].id;
      if (asked && pid === asked && pid !== state.preferences.activeProfile) api.putPreference("activeProfile", pid).catch(() => undefined);
      const drafts = await loadDrafts(pid, state.designs[pid] as Design | undefined);
      sessionRef.current = session;
      setBoot({ status: "ready", data: fromState(state, drafts, pid, session) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { clearToken(); return setBoot({ status: "auth", error: "That token was not accepted." }); }
      setBoot({ status: "error", message: e instanceof Error ? e.message : "Something went wrong" });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * Open a brand: read the server's state again and load that brand's drafts, then swap the whole studio over to it, so
   * its card, drafts, queue, accounts and conversations are shown and nothing of the previous brand is. The screen stays
   * as it is until the new one is ready. Throws if the server cannot be reached.
   */
  const openBrand = useCallback(async (id: string) => {
    const state = await api.state();
    const pid = pickActive(id, state.profiles as Profile[]) ?? DEFAULT_PROFILES[0].id;
    const drafts = await loadDrafts(pid, state.designs[pid] as Design | undefined);
    api.putPreference("activeProfile", pid).catch(() => undefined); // only means the choice is not remembered
    setBoot({ status: "ready", data: fromState(state, drafts, pid, sessionRef.current) });
  }, []);

  const submitToken = (t: string) => { setToken(t.trim()); void load(); };

  return { boot, retry: load, submitToken, openBrand };
}
