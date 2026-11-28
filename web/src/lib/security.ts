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
