import { createContext, useContext } from "react";

/** How the workspace is arranged. Saved on the server so it follows the user, not the browser. */
export interface Layout {
  sidebarCollapsed: boolean;
  /** Section id -> true when that section is folded. */
  collapsed: Record<string, boolean>;
  /** Height in pixels the user dragged the sidebar editor to. */
  editorHeight?: number;
  /** What the left column holds: the chat, the item's fields, or the card's look. */
  mode: "chat" | "details" | "design";
  /** Show a post and its article side by side, when there is room. */
  both: boolean;
  /** Width in pixels the left column was dragged to; absent for the usual width. */
  sidebarWidth?: number;
}

export const SIDEBAR_WIDTH = 380;
const SIDEBAR_MIN = 320, SIDEBAR_MAX = 720, CANVAS_MIN = 480;
/** A width for the left column that is within its limits and, on a given window, leaves the canvas its room. */
export const clampSidebar = (w: number, windowWidth = Infinity) => Math.round(Math.max(SIDEBAR_MIN, Math.min(w, SIDEBAR_MAX, windowWidth - CANVAS_MIN)));

export const DEFAULT_LAYOUT: Layout = { sidebarCollapsed: false, collapsed: {}, mode: "chat", both: false };

/** Read a saved value defensively: anything unexpected falls back to the default. */
export function parseLayout(v: unknown): Layout {
  if (!v || typeof v !== "object") return DEFAULT_LAYOUT;
  const o = v as Record<string, unknown>;
  const collapsed: Record<string, boolean> = {};
  if (o.collapsed && typeof o.collapsed === "object") {
    for (const [k, val] of Object.entries(o.collapsed as Record<string, unknown>)) if (val === true) collapsed[k] = true;
  }
  const h = typeof o.editorHeight === "number" && o.editorHeight >= 120 && o.editorHeight <= 4000 ? Math.round(o.editorHeight) : undefined;
  const w = typeof o.sidebarWidth === "number" && Number.isFinite(o.sidebarWidth) ? { sidebarWidth: clampSidebar(o.sidebarWidth) } : {};
  return { sidebarCollapsed: o.sidebarCollapsed === true, collapsed, editorHeight: h, mode: o.mode === "details" || o.mode === "edit" ? "details" : o.mode === "design" ? "design" : "chat", both: o.both === true, ...w };
}

interface Ctx {
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  editorHeight?: number;
  setEditorHeight: (h: number) => void;
}

/** Whether a section is open. One that starts folded keeps the opposite note: that it was opened. */
export const sectionOpen = (noted: boolean, startsFolded: boolean) => noted === startsFolded;

/** Without a provider every section is open and nothing is saved, so a Section works anywhere. */
export const LayoutContext = createContext<Ctx>({ isCollapsed: () => false, toggle: () => undefined, setEditorHeight: () => undefined });
export const useLayout = () => useContext(LayoutContext);
