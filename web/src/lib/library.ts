import type { JobStatus } from "./jobs";

/** One row of the library: a post (sent, waiting or failed) or a draft that has not become a post. */
export interface LibraryItem {
  type: "job" | "draft";
  id: string;
  profileId: string;
  kind: "post" | "article";
  status: JobStatus | "draft" | "approved";
  title: string;
  excerpt: string;
  /** UTC. When it was posted, else scheduled for, else created; for a draft, when it was last edited. */
  at: string;
  postUrl?: string;
  draftId?: string;
  /** An approved article's planned date (UTC). Nothing is sent. */
  plannedAt?: string;
  timezone?: string;
}

export interface LibraryPage { items: LibraryItem[]; total: number; page: number; pageSize: number; pages: number }

export const PAGE_SIZES = [10, 20, 50] as const;

/** The page numbers to show: the first, the last, and a few around the current one, with "…" where pages are left out. */
export function pageNumbers(page: number, pages: number): (number | "…")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

export interface LibraryFilter {
  /** A brand id, or "all". */
  brand: string;
  kind: "" | "post" | "article";
  status: string;
  q: string;
}

export const LIBRARY_STATUS_LABEL: Record<LibraryItem["status"], string> = {
  published: "Published",
  scheduled: "Scheduled",
  publishing: "Publishing…",
  failed: "Failed",
  missed: "Missed",
  needs_review: "Check LinkedIn",
  cancelled: "Cancelled",
  draft: "Draft",
  approved: "Approved",
};

/** The statuses worth filtering by, in the order they are offered. */
export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "published", label: "Published" },
  { value: "scheduled", label: "Scheduled" },
  { value: "draft", label: "Drafts" },
  { value: "approved", label: "Approved" },
  { value: "failed", label: "Failed" },
  { value: "needs_review", label: "Check LinkedIn" },
];

/** Where a draft opens in the editor, in its own brand. */
export const draftLink = (base: string, item: LibraryItem) => `${base}studio/?brand=${encodeURIComponent(item.profileId)}&draft=${encodeURIComponent(item.id)}`;
