import type { Perm } from "./session";

/** Where each part of the app lives. */
const base = () => import.meta.env.BASE_URL;
export const DOCS_URL = "https://www.senthilsweb.com/cardpress/";
/** The user guide, a page of the app. */
export const helpHref = () => `${base()}help/`;
export const studioHref = (query = "") => `${base()}studio/${query}`;
export const libraryHref = (kind?: "post" | "article") => `${base()}library/${kind ? `?kind=${kind}` : ""}`;
/** A brand's pictures, documents and video links. */
export const mediaHref = () => `${base()}media/`;
/** The page a person lands on. */
export const dashboardHref = (query = "") => `${base()}dashboard/${query}`;
export const calendarHref = (query = "") => `${base()}calendar/${query}`;
export const settingsHref = (section?: SettingsSection, query = "") => `${base()}settings/${section ? `${section}/` : ""}${query}`;

export type Area = "dashboard" | "studio" | "library" | "calendar" | "settings" | "help";

export type SettingsSection = "account" | "appearance" | "api-keys" | "brands" | "look" | "social" | "users" | "assistant";

export const SETTINGS_GROUPS = ["Me", "Brand", "Administration"] as const;

export interface SectionDef {
  id: SettingsSection;
  label: string;
  group: (typeof SETTINGS_GROUPS)[number];
  /** One line saying what the page is. */
  about: string;
  /** Other words the search finds it by. */
  words: string;
  /** Needs a signed-in person (a server with accounts). */
  person?: boolean;
  /** Needs this permission. */
  perm?: Perm;
}

/** The settings pages, in the order they are listed. */
export const SETTINGS_SECTIONS: readonly SectionDef[] = [
  { id: "account", label: "Account", group: "Me", about: "Your details and password.", words: "profile name phone birth email password", person: true },
  { id: "appearance", label: "Appearance", group: "Me", about: "The application's colours, for you.", words: "theme colour color dark light parchment aubergine cobalt graphite" },
  { id: "api-keys", label: "API keys", group: "Me", about: "Keys for programs that act as you.", words: "token mcp agent script", person: true },
  { id: "brands", label: "Brands", group: "Brand", about: "Open, order, copy and archive brands.", words: "brand client rename duplicate archive new" },
  { id: "look", label: "Brand look", group: "Brand", about: "A brand's name, logo, fonts and colours.", words: "logo font palette colour color handle website" },
  { id: "social", label: "Social accounts", group: "Brand", about: "Where the open brand publishes.", words: "linkedin x twitter instagram facebook connect token publish", perm: "social" },
  { id: "users", label: "Users", group: "Administration", about: "People and their roles.", words: "people role admin editor password disable", person: true, perm: "users" },
  { id: "assistant", label: "Assistant", group: "Administration", about: "Whether the assistant is connected.", words: "ai agent claude chat", perm: "users" },
];

/** The pages whose name or words hold everything typed. */
export function findSections(sections: readonly SectionDef[], query: string): SectionDef[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return sections.filter((s) => terms.every((t) => `${s.label} ${s.group} ${s.words}`.toLowerCase().includes(t)));
}

/**
 * What a settings address opens: `/settings/social/` and the like, or `/settings/` with no page named. Null for any other
 * address. The older `/settings/brands/?look=<brand>` means that brand's look.
 */
export function settingsPlace(path: string, query = ""): { section?: SettingsSection; query: URLSearchParams } | null {
  if (!/\/settings(\/[a-z-]+)?\/?$/.test(path)) return null;
  const params = new URLSearchParams(query);
  const section = sectionFromPath(path);
  return { section: section === "brands" && params.get("look") ? "look" : section, query: params };
}

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
