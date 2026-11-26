import type { Perm } from "./session";

/** Where each part of the app lives. */
const base = () => import.meta.env.BASE_URL;
export const DOCS_URL = "https://www.senthilsweb.com/cardpress/";
export const studioHref = (query = "") => `${base()}studio/${query}`;
export const libraryHref = (kind?: "post" | "article") => `${base()}library/${kind ? `?kind=${kind}` : ""}`;
export const calendarHref = (query = "") => `${base()}calendar/${query}`;
export const settingsHref = (section?: SettingsSection, query = "") => `${base()}settings/${section ? `${section}/` : ""}${query}`;

export type Area = "studio" | "library" | "calendar" | "settings";

export type SettingsSection = "account" | "brands" | "social" | "api-keys" | "users" | "assistant";

interface SectionDef {
  id: SettingsSection;
  label: string;
  /** Needs a signed-in person (a server with accounts). */
  person?: boolean;
  /** Needs this permission. */
  perm?: Perm;
}

/** The settings pages, in the order they are listed. */
export const SETTINGS_SECTIONS: readonly SectionDef[] = [
  { id: "account", label: "Account", person: true },
  { id: "brands", label: "Brands" },
  { id: "social", label: "Social accounts", perm: "social" },
  { id: "api-keys", label: "API keys", person: true },
  { id: "users", label: "Users", person: true, perm: "users" },
  { id: "assistant", label: "Assistant", perm: "users" },
];

/** The settings pages this person may open. */
export function visibleSections(signedIn: boolean, can: (p: Perm) => boolean): SectionDef[] {
  return SETTINGS_SECTIONS.filter((s) => (!s.person || signedIn) && (!s.perm || can(s.perm)));
}

/** The section named by a settings address (`/settings/api-keys/`), or undefined for `/settings/` itself. */
export function sectionFromPath(path: string): SettingsSection | undefined {
  const m = /\/settings\/([a-z-]+)\/?$/.exec(path);
  return SETTINGS_SECTIONS.find((s) => s.id === m?.[1])?.id;
}

/** Old studio addresses (`/studio/?open=users`) and the settings page each now means. */
export const LEGACY_OPEN: Record<string, SettingsSection> = { account: "account", users: "users", accounts: "social", brands: "brands" };
