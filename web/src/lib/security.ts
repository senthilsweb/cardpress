/** The rules about signing in that an administrator sets. */
export interface SecuritySettings {
  signupOpen: boolean;
  defaultRole: "editor" | "writer";
  idleMinutes: number;
  maxMinutes: number;
  minPassword: number;
  attempts: number;
  pauseMinutes: number;
}
export interface Security { settings: SecuritySettings; defaults: SecuritySettings; saved: boolean; activeSessions: number }

export interface SecurityEvent { id: number; at: string; event: string; actor?: string; subject?: string; address?: string; detail?: string }

const EVENTS: Record<string, string> = {
  sign_in: "Signed in", sign_in_failed: "Sign-in failed", sign_in_paused: "Sign-in paused", sign_out: "Signed out",
  sign_up: "Account created", user_added: "User added", password_changed: "Password changed", password_set: "Password set",
  role_changed: "Role changed", status_changed: "Account status changed", security_changed: "Security changed",
  security_reset: "Security defaults restored", everyone_signed_out: "Everyone signed out",
};

/** An event in words, with whose account it is about and who did it when that is someone else. */
export const eventLabel = (event: string) => EVENTS[event] ?? event;
export const eventLine = (e: SecurityEvent) =>
  [e.subject, e.actor && e.actor !== e.subject ? `by ${e.actor}` : "", e.detail, e.address].filter(Boolean).join(" · ");

export const IDLE_CHOICES = [5, 10, 15, 20, 30, 60, 120, 480, 1440] as const;
export const MAX_CHOICES = [60, 240, 480, 720, 1440, 10080, 43200] as const;

/** "20 minutes", "12 hours", "7 days". */
export function minutesLabel(m: number): string {
  const say = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  if (m % 1440 === 0 && m >= 2880) return say(m / 1440, "day");
  if (m % 60 === 0) return say(m / 60, "hour");
  return say(m, "minute");
}

/** The choices of a drop-down, with the value in force among them even when the configuration set another. */
export const withValue = (choices: readonly number[], value: number) => [...new Set([...choices, value])].sort((a, b) => a - b);

const RANGES: [keyof SecuritySettings, string, number, number][] = [
  ["minPassword", "The shortest password", 10, 64],
  ["attempts", "Failed sign-ins", 3, 20],
  ["pauseMinutes", "Minutes of a pause", 1, 1440],
];

/** Why these cannot be saved, or null. The server checks again. */
export function securityProblem(s: SecuritySettings): string | null {
  for (const [key, name, from, to] of RANGES) {
    const v = s[key] as number;
    if (!Number.isInteger(v) || v < from || v > to) return `${name}: ${from} to ${to}.`;
  }
  return s.maxMinutes < s.idleMinutes ? "The longest sign-in must not be shorter than the time without use." : null;
}
