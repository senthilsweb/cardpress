/** The dashboard's figures, as `GET /dashboard` gives them, and how they are written. */

export interface Counts { total: number; draft: number; approved: number; scheduled: number; published: number; attention: number; pages: number }
export interface DashboardItem { type: "job" | "draft"; id: string; draftId?: string; profileId: string; kind: "post" | "article"; status: string; title: string; at: string }
export interface Spend { start: string; costCents: number; replies: number }
export interface SessionSpend { conversationId: string; profileId: string; title: string; costCents: number; replies: number; activeSeconds: number; lastAt: string }
export interface Usage { costCents: number; sessions: number; replies: number; activeSeconds: number; bucket: "day" | "week"; series: Spend[]; largest: SessionSpend[] }
export interface BrandSummary { id: string; posts: Counts; articles: Counts; costCents: number; sessions: number }
export interface Dashboard { brands: BrandSummary[]; posts: Counts; articles: Counts; next: DashboardItem[]; recent: DashboardItem[]; usage: Usage }

export const PERIODS = [{ days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }, { days: 0, label: "All" }] as const;

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
