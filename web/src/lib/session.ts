import { createContext, useContext } from "react";

/** What a role lets a person do. The server checks every request; the screens use this only to hide what would be refused. */
export type Perm = "write" | "approve" | "publish" | "social" | "users";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone?: string;
  /** YYYY-MM-DD */
  birthDate?: string;
  roles: string[];
  status: "active" | "disabled";
  createdAt: string;
  lastLoginAt?: string;
}

export interface Session { user?: User; perms: Perm[] }

export const ROLES = [
  { value: "admin", label: "Admin", hint: "Everything, and everyone's work" },
  { value: "editor", label: "Editor", hint: "Write, approve and publish their own" },
  { value: "writer", label: "Writer", hint: "Write drafts only" },
] as const;

export const roleLabel = (u?: Pick<User, "roles">) =>
  (u?.roles ?? []).map((r) => ROLES.find((x) => x.value === r)?.label ?? r).join(", ");

export const initialsOf = (u?: Pick<User, "firstName" | "lastName">) =>
  ((u?.firstName?.[0] ?? "") + (u?.lastName?.[0] ?? "")).toUpperCase() || "?";

interface SessionValue extends Session {
  can: (p: Perm) => boolean;
  /** Replace the person (after they change their details). */
  setUser: (u: User) => void;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue>({ perms: ["write", "approve", "publish", "social"], can: () => true, setUser: () => undefined, signOut: async () => undefined });
export const useSession = () => useContext(SessionContext);

export const base = () => import.meta.env.BASE_URL;
export const loginUrl = (next?: string) => `${base()}login/${next ? `?next=${encodeURIComponent(next)}` : ""}`;
export const signupUrl = () => `${base()}signup/`;
/** Sign-in after a session ended by itself: it says so, and comes back here afterwards. */
export const endedUrl = () => `${loginUrl(window.location.pathname + window.location.search)}&ended=1`;

/** Months for the date-of-birth drop-down. */
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "1990-12-10" to its three parts, or empty strings. */
export function splitDate(d?: string): { y: string; m: string; d: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? "");
  return m ? { y: m[1], m: String(Number(m[2])), d: String(Number(m[3])) } : { y: "", m: "", d: "" };
}

/** Three drop-down values to YYYY-MM-DD. Empty if any is missing; the server checks that it is a real date. */
export function joinDate(y: string, m: string, d: string): string {
  if (!y || !m || !d) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** How many days a month of a year has, so the Day drop-down never offers 31 February. */
export const daysIn = (y: string, m: string) => (m ? new Date(Number(y) || 2000, Number(m), 0).getDate() : 31);
