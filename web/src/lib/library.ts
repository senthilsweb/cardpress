import type { JobStatus } from "./jobs";
import type { Design } from "./types";

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
  /** A draft's card, for the thumbnail. Absent for a posted item (its image is fetched) or a design too large to list. */
  design?: Design;
  /** The item has a live public page at `pagePath(item)`. */
  slug?: string;
  pageAt?: string;
  /** Who wrote it and who approved it, by name, and its latest saved version. */
  createdBy?: string;
  approvedBy?: string;
  version?: number;
}

/** Where an item's public page is, when it has a live one. */
export const pagePath = (item: Pick<LibraryItem, "kind" | "slug" | "pageAt">): string | null =>
  item.slug && item.pageAt ? `/${item.kind === "article" ? "articles" : "posts"}/${encodeURIComponent(item.slug)}` : null;

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

/* ---------------------------------------------------------------- the grid */

export type SortKey = "at" | "title" | "status" | "kind" | "brand";
export interface LibrarySort { sort: SortKey; order: "asc" | "desc" }
export const DEFAULT_SORT: LibrarySort = { sort: "at", order: "desc" };

/** Pressing a column's heading sorts by it; pressing it again turns the order round. Dates start newest first. */
export function nextSort(cur: LibrarySort, key: SortKey): LibrarySort {
  if (cur.sort === key) return { sort: key, order: cur.order === "asc" ? "desc" : "asc" };
  return { sort: key, order: key === "at" ? "desc" : "asc" };
}

export type ColumnId = "type" | "status" | "when" | "brand" | "createdBy" | "approvedBy" | "version" | "planned" | "page" | "linkedin";
export const COLUMNS: { id: ColumnId; label: string; sort?: SortKey; shown: boolean }[] = [
  { id: "type", label: "Type", sort: "kind", shown: true },
  { id: "status", label: "Status", sort: "status", shown: true },
  { id: "when", label: "When", sort: "at", shown: true },
  { id: "brand", label: "Brand", sort: "brand", shown: true },
  { id: "createdBy", label: "Written by", shown: false },
  { id: "approvedBy", label: "Approved by", shown: false },
  { id: "version", label: "Version", shown: false },
  { id: "planned", label: "Planned", shown: false },
  { id: "page", label: "Public page", shown: false },
  { id: "linkedin", label: "LinkedIn", shown: false },
];
export const defaultColumns = (): ColumnId[] => COLUMNS.filter((c) => c.shown).map((c) => c.id);

/** A row's key, unique across posts and drafts. */
export const rowKey = (it: Pick<LibraryItem, "type" | "id">) => `${it.type}:${it.id}`;

type Can = (p: "write" | "approve" | "publish") => boolean;

/** What can be done with a row, and why not when something cannot. The server checks each again. */
export function rowActions(it: LibraryItem, can: Can) {
  const draft = it.type === "draft";
  const job = !draft;
  const published = it.status === "published";
  const waiting = it.status === "scheduled" || it.status === "publishing";
  let deleteWhy: string | null = null;
  if (draft && it.status !== "draft") deleteWhy = "Bring it back to draft first";
  if (job && waiting) deleteWhy = "Cancel the scheduled post first";
  if (job && !can("publish")) deleteWhy = "You cannot delete posts";
  return {
    view: true,
    edit: draft && (it.status === "draft" || it.status === "approved"),
    schedule: draft && it.status === "approved" && (it.kind === "article" ? can("approve") : can("publish")),
    backToDraft: draft && it.status === "approved",
    delete: deleteWhy === null,
    deleteWhy,
    /** Deleting a post only removes the record here: the post stays on LinkedIn. */
    recordOnly: job,
    readOnly: published || waiting,
  };
}

/** What a confirmation should say before deleting these rows. */
export function deleteSummary(items: LibraryItem[]): { drafts: number; records: number; text: string } {
  const drafts = items.filter((i) => i.type === "draft").length;
  const records = items.length - drafts;
  const parts: string[] = [];
  if (drafts) parts.push(`${drafts} ${drafts === 1 ? "draft" : "drafts"} and ${drafts === 1 ? "its card" : "their cards"}`);
  if (records) parts.push(`${records} post ${records === 1 ? "record" : "records"} (the ${records === 1 ? "post stays" : "posts stay"} on LinkedIn)`);
  return { drafts, records, text: `This deletes ${parts.join(" and ")}. It cannot be undone.` };
}
