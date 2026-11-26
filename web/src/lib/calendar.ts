import type { Design } from "./types";

/** One thing on the calendar: a post (sent, waiting or failed) or an article's planned date. */
export interface CalendarEntry {
  type: "job" | "plan";
  id: string;
  draftId?: string;
  profileId: string;
  kind: "post" | "article";
  status: string;
  title: string;
  /** UTC. */
  at: string;
  /** The zone it was chosen in. */
  timezone?: string;
  postUrl?: string;
}

/** An approved item with no date yet. */
export interface ReadyItem { id: string; profileId: string; kind: "post" | "article"; title: string; updatedAt: string; design?: Design }

export type CalendarView = "month" | "week" | "day";

/** Midnight at the start of a day, in the viewer's time. */
export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Weeks start on Monday. */
export const startOfWeek = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** A day as `YYYY-MM-DD` in the viewer's time, for keys and addresses. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function parseDayKey(s: string | null): Date | null {
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** The days a view shows: six weeks around the month, one week, or one day. */
export function viewDays(view: CalendarView, anchor: Date): Date[] {
  if (view === "day") return [startOfDay(anchor)];
  const first = view === "week" ? startOfWeek(anchor) : startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  return Array.from({ length: view === "week" ? 7 : 42 }, (_, i) => addDays(first, i));
}

/** The span to ask the server for: [from, to) in UTC. */
export function viewRange(view: CalendarView, anchor: Date): { from: string; to: string } {
  const days = viewDays(view, anchor);
  return { from: days[0].toISOString(), to: addDays(days[days.length - 1], 1).toISOString() };
}

/** The next or previous month, week or day. */
export function step(view: CalendarView, anchor: Date, dir: -1 | 1): Date {
  if (view === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  return addDays(anchor, dir * (view === "week" ? 7 : 1));
}

/** The heading for a view: "November 2026", "23 – 29 Nov 2026", "Thursday 26 November 2026". */
export function viewTitle(view: CalendarView, anchor: Date, locale?: string): string {
  if (view === "month") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(anchor);
  if (view === "day") return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(anchor);
  const days = viewDays("week", anchor);
  const f = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  return `${f.format(days[0])} – ${f.format(days[6])} ${days[6].getFullYear()}`;
}

/** Entries by the day they fall on in the viewer's time, each day in time order. */
export function byDay(entries: CalendarEntry[]): Map<string, CalendarEntry[]> {
  const out = new Map<string, CalendarEntry[]>();
  for (const e of [...entries].sort((a, b) => a.at.localeCompare(b.at))) {
    const k = dayKey(new Date(e.at));
    out.set(k, [...(out.get(k) ?? []), e]);
  }
  return out;
}

/** How an entry is marked: sent, waiting, a problem, or a planned article. */
export function entryState(e: Pick<CalendarEntry, "type" | "status">): "sent" | "waiting" | "problem" | "planned" {
  if (e.type === "plan") return "planned";
  if (e.status === "published") return "sent";
  if (e.status === "scheduled" || e.status === "publishing") return "waiting";
  return "problem";
}

/** Where an entry opens: its page in the library. */
export const entryHref = (base: string, e: Pick<CalendarEntry, "type" | "id">) => `${base}library/?item=${e.type === "job" ? "job" : "draft"}:${encodeURIComponent(e.id)}`;

/** A time of day in the viewer's time, such as 09:30. */
export const clock = (iso: string, locale?: string) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
