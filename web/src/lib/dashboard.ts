/** The dashboard's figures, as `GET /dashboard` gives them, and how they are written. */

export interface Counts { total: number; draft: number; approved: number; scheduled: number; published: number; attention: number; pages: number }
export interface DashboardItem { type: "job" | "draft"; id: string; draftId?: string; profileId: string; kind: "post" | "article"; status: string; title: string; at: string }
export interface Spend { start: string; costCents: number; replies: number }
export interface SessionSpend { conversationId: string; profileId: string; title: string; costCents: number; replies: number; activeSeconds: number; lastAt: string }
export interface Usage { costCents: number; sessions: number; replies: number; activeSeconds: number; bucket: "day" | "week"; series: Spend[]; largest: SessionSpend[] }
export interface BrandSummary { id: string; posts: Counts; articles: Counts; costCents: number; sessions: number }
/** The person's figures over everything they may open. `users` is told to an admin only. */
export interface Totals { brands: number; users?: number; disabledUsers?: number; costCents: number }
export interface Dashboard { totals: Totals; /** The days covered; empty for all time. */ period: { from?: string; to?: string }; brands: BrandSummary[]; posts: Counts; articles: Counts; next: DashboardItem[]; recent: DashboardItem[]; usage: Usage }

export const PERIODS = [{ days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }, { days: 0, label: "All" }] as const;

/** What the figures that follow time cover: the last so many days (0: all time), or chosen days, both included. */
export type Period = { days: number } | { from: string; to: string };

export const periodQuery = (p: Period): Record<string, string> => ("from" in p ? { from: p.from, to: p.to } : { days: String(p.days) });

/** The most days a chosen range may span, as the server allows. */
const MAX_DAYS = 5 * 366 + 1;
const dayNumber = (day: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m || Number(m[1]) < 2000) return NaN;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === day ? t / 86_400_000 : NaN;
};

/** What is wrong with a chosen range, in words; empty when it can be used. */
export function rangeProblem(from: string, to: string): string {
  const a = dayNumber(from), b = dayNumber(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return "Choose both days.";
  if (b < a) return "The first day is after the last.";
  return b - a >= MAX_DAYS ? "Choose at most five years." : "";
}

/** The period as the browser remembers it ("30", or "2026-10-01..2026-10-15"); anything else is the last 30 days. */
export function readPeriod(saved: string | null): Period {
  const [from, to] = (saved ?? "").split("..");
  if (to !== undefined) return rangeProblem(from, to) ? { days: 30 } : { from, to };
  return PERIODS.some((p) => String(p.days) === saved) ? { days: Number(saved) } : { days: 30 };
}
export const writePeriod = (p: Period) => ("from" in p ? `${p.from}..${p.to}` : String(p.days));

/** Chosen days as "1 Oct – 15 Oct 2026", with both years when they differ. */
export function rangeLabel(from: string, to: string): string {
  const year = (d: string) => d.slice(0, 4);
  if (from === to) return `${shortDay(from)} ${year(from)}`;
  return `${shortDay(from)}${year(from) === year(to) ? "" : ` ${year(from)}`} – ${shortDay(to)} ${year(to)}`;
}

export function periodLabel(p: Period): string {
  if ("from" in p) return rangeLabel(p.from, p.to);
  return p.days ? `last ${p.days} days` : "all time";
}

export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Working time in the two largest units: "45 s", "3 min 20 s", "2 h 5 min". */
export function duration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  if (s < 3600) return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
  const m = Math.round((s % 3600) / 60), h = Math.floor(s / 3600) + (m === 60 ? 1 : 0);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** "2026-11-27" as "27 Nov", read as a day, not as midnight somewhere. */
export function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The statuses of a kind that are listed under its total, with the Library's name for each. A post is never "approved" once scheduled. */
export function statusRows(kind: "post" | "article", c: Counts): { label: string; count: number; status?: string }[] {
  if (kind === "article") return [{ label: "Draft", count: c.draft, status: "draft" }, { label: "Approved", count: c.approved, status: "approved" }, { label: "Public page", count: c.pages }];
  return [
    { label: "Draft", count: c.draft, status: "draft" },
    { label: "Approved", count: c.approved, status: "approved" },
    { label: "Scheduled", count: c.scheduled, status: "scheduled" },
    { label: "Published", count: c.published, status: "published" },
    ...(c.attention ? [{ label: "Needs a look", count: c.attention }] : []),
  ];
}
