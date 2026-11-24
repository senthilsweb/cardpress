import type { JobStatus } from "./jobs";

/** One row of the library: a post (sent, waiting or failed) or a draft that has not become a post. */
export interface LibraryItem {
  type: "job" | "draft";
  id: string;
  profileId: string;
  kind: "post" | "article";
  status: JobStatus | "draft";
  title: string;
  excerpt: string;
  /** UTC. When it was posted, else scheduled for, else created; for a draft, when it was last edited. */
  at: string;
  postUrl?: string;
  draftId?: string;
}

export interface LibraryPage { items: LibraryItem[]; next?: string }

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
};

/** The statuses worth filtering by, in the order they are offered. */
export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "published", label: "Published" },
  { value: "scheduled", label: "Scheduled" },
  { value: "draft", label: "Drafts" },
  { value: "failed", label: "Failed" },
  { value: "needs_review", label: "Check LinkedIn" },
];

/** Where a draft opens in the editor, in its own brand. */
export const draftLink = (base: string, item: LibraryItem) => `${base}studio/?brand=${encodeURIComponent(item.profileId)}&draft=${encodeURIComponent(item.id)}`;
