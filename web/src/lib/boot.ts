import { useCallback, useEffect, useState } from "react";
import { api, ApiError, clearToken, getToken, setToken } from "./api";
import { DEFAULT_PROFILES, completeProfiles, upgradePlaceholderText, withStandardPalettes } from "./profiles";
import { pickActive } from "./brands";
import { docFromPlainText, EMPTY_DOC, type Draft } from "./draft";
import type { Design, Profile } from "./types";
import type { FontDef } from "./fonts";
import { parseLayout, type Layout } from "./layout";

/** What the studio needs to start. */
export interface Loaded {
  /** Every active brand, in order. */
  profiles: Profile[];
  /** Brands hidden from the studio but kept with their history. */
  archived: Profile[];
  /** The brand that is open. */
  activeId: string;
  designs: Record<string, Design>;
  theme?: "light" | "dark";
  customFonts: FontDef[];
  drafts: Draft[];
  layout: Layout;
}

export interface LegacyData { profiles: Profile[]; designs: Record<string, Design>; theme?: "light" | "dark"; customFonts: FontDef[] }

export type Boot =
  | { status: "loading" }
  | { status: "auth"; error?: string }
  | { status: "error"; message: string }
  | { status: "legacy"; legacy: LegacyData; busy?: boolean; error?: string }
  | { status: "ready"; data: Loaded };

/* The browser used to hold everything in localStorage. These are the old keys. */
const LEGACY_KEYS = ["scs.profiles.v1", "scs.activeProfile.v1", "scs.designs.v1", "scs.theme", "scs.customFonts.v1"];

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Old browser data worth importing, or undefined. Only the active profile is kept: the studio now has one. */
export function readLegacy(): LegacyData | undefined {
  const profiles = readJson<Profile[]>("scs.profiles.v1");
  if (!Array.isArray(profiles) || !profiles.length || !profiles.every((p) => p && typeof p.id === "string" && Array.isArray(p.palettes))) return undefined;
  const activeId = readJson<string>("scs.activeProfile.v1");
  const keep = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const designs = readJson<Record<string, Design>>("scs.designs.v1") ?? {};
  const fonts = readJson<FontDef[]>("scs.customFonts.v1");
  let theme: "light" | "dark" | undefined;
  try { const t = localStorage.getItem("scs.theme"); if (t === "light" || t === "dark") theme = t; } catch { /* ignore */ }
  return {
    profiles: [keep],
    designs: designs[keep.id] ? { [keep.id]: designs[keep.id] } : {},
    theme,
    customFonts: Array.isArray(fonts) ? fonts.filter((f) => f && typeof f.family === "string") : [],
  };
}

const clearLegacy = () => { try { LEGACY_KEYS.forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ } };

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

function fromState(s: Awaited<ReturnType<typeof api.state>>, drafts: Draft[], activeId: string): Loaded {
  const profiles = (s.profiles as Profile[]).length ? withStandardPalettes(s.profiles as Profile[]) : DEFAULT_PROFILES;
  const archived = Array.isArray(s.archived) ? completeProfiles(s.archived as Profile[]) : [];
  const theme = s.preferences.theme === "dark" || s.preferences.theme === "light" ? s.preferences.theme : undefined;
  const fonts = Array.isArray(s.preferences.customFonts) ? (s.preferences.customFonts as FontDef[]) : [];
  const designs = Object.fromEntries(Object.entries(s.designs as Record<string, Design>).map(([k, d]) => [k, upgradePlaceholderText(d)]));
  return { profiles, archived, activeId, designs, theme, customFonts: fonts, drafts, layout: parseLayout(s.preferences.layout) };
}

export function useBoot() {
  const [boot, setBoot] = useState<Boot>({ status: "loading" });

  const load = useCallback(async () => {
    setBoot({ status: "loading" });
    try {
      const info = await api.info();
      if (info.authRequired && !getToken()) return setBoot({ status: "auth" });
      let state = await api.state();
      if (!state.profiles.length) {
        const legacy = readLegacy();
        if (legacy) return setBoot({ status: "legacy", legacy });
        // A fresh install: save the starting brand now, so the server knows it (accounts and posts are kept per brand).
        await api.putProfiles(DEFAULT_PROFILES);
        state = await api.state();
      }
      const pid = pickActive(state.preferences.activeProfile, state.profiles as Profile[]) ?? DEFAULT_PROFILES[0].id;
      const drafts = await loadDrafts(pid, state.designs[pid] as Design | undefined);
      setBoot({ status: "ready", data: fromState(state, drafts, pid) });
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
    setBoot({ status: "ready", data: fromState(state, drafts, pid) });
  }, []);

  const submitToken = (t: string) => { setToken(t.trim()); void load(); };

  const importLegacy = async (l: LegacyData) => {
    setBoot({ status: "legacy", legacy: l, busy: true });
    try {
      await api.importLegacy({
        profiles: l.profiles,
        designs: l.designs,
        preferences: { ...(l.theme ? { theme: l.theme } : {}), ...(l.customFonts.length ? { customFonts: l.customFonts } : {}) },
      });
      clearLegacy(); // only after the server has it
      await load();
    } catch (e) {
      setBoot({ status: "legacy", legacy: l, error: e instanceof Error ? e.message : "Import failed" });
    }
  };

  const discardLegacy = () => { clearLegacy(); void load(); };

  return { boot, retry: load, submitToken, importLegacy, discardLegacy, openBrand };
}
