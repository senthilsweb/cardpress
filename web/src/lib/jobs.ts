/** A confirmed post, waiting for or recording its trip to LinkedIn. */
export type JobStatus = "scheduled" | "publishing" | "published" | "failed" | "missed" | "needs_review" | "cancelled";

export interface Job {
  id: string;
  profileId: string;
  draftId?: string;
  network: string;
  status: JobStatus;
  body: string;
  hashtags: string[];
  /** The text and hashtag line as the preview showed them. */
  previewText: string;
  altText: string;
  /** What it carries: the card, or a file of the post's own (a picture, or a PDF document with a title). */
  attachment?: "card" | "image" | "document" | "images" | "video";
  attachmentTitle?: string;
  /** Where a video post reads its file from when it is sent. */
  videoUrl?: string;
  /** How many pictures a multi-image post carries. */
  imageCount?: number;
  /** UTC. Empty for a post published at once. */
  scheduledAt?: string;
  /** IANA zone to show the time in. */
  timezone?: string;
  error?: string;
  postUrn?: string;
  postUrl?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface NewJob {
  profileId: string;
  draftId: string;
  /** The post text without the hashtag line. */
  body: string;
  hashtags: string[];
  altText: string;
  /** RFC 3339, UTC. Leave out to publish now. */
  scheduledAt?: string;
  timezone?: string;
}

export const STATUS_LABEL: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  publishing: "Publishing…",
  published: "Published",
  failed: "Failed",
  missed: "Missed",
  needs_review: "Check LinkedIn",
  cancelled: "Cancelled",
};

/** A job the server may still change by itself, so the list keeps refreshing while one exists. */
export const isActive = (j: Job) => j.status === "scheduled" || j.status === "publishing";

/* ------------------------------------------------------------------ time zones */

export const defaultTimezone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; }
};

export function timezones(): string[] {
  try {
    const list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (list?.length) return list.includes("UTC") ? list : ["UTC", ...list];
  } catch { /* fall through */ }
  return ["UTC", defaultTimezone()];
}

/** Cities that browsers still list, or have started to list, under their other name. */
const OTHER_NAMES: [string, string][] = [["Calcutta", "Kolkata"], ["Saigon", "Ho_Chi_Minh"], ["Katmandu", "Kathmandu"], ["Rangoon", "Yangon"], ["Kiev", "Kyiv"], ["Godthab", "Nuuk"]];
/** The other name of a zone's city, so that either one finds it. */
export const zoneOtherName = (tz: string) => OTHER_NAMES.flatMap(([a, b]) => (tz.endsWith(`/${a}`) ? [b] : tz.endsWith(`/${b}`) ? [a] : [])).join(" ");

/** The offset of `tz` from UTC at instant `t`, in milliseconds (zone time minus UTC). */
function offsetMs(t: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(t));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(t / 1000) * 1000;
}

/**
 * Turn what someone typed in a datetime-local box ("2026-12-01T09:30"), meant as wall-clock time in `tz`, into the
 * real instant. Two passes settle daylight-saving changes. A time that does not exist (the hour skipped in spring)
 * lands an hour later; the form shows the result so it is never a surprise.
 */
export function zonedToUtc(local: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  try {
    let t = wall - offsetMs(wall, tz);
    t = wall - offsetMs(t, tz);
    return new Date(t);
  } catch {
    return null; // unknown zone
  }
}

/** A Date as the value a datetime-local box wants, in `tz`. */
export function toLocalInput(date: Date, tz: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(date);
  const g = (type: string) => p.find((x) => x.type === type)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** "1 Dec 2026, 9:30 AM GMT" in the given zone. */
export function formatInZone(iso: string, tz?: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz || undefined, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** "in 2 h 10 min", "5 min ago". */
export function relative(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff), min = Math.round(abs / 60000);
  const text = min < 1 ? "less than a minute" : min < 90 ? `${min} min` : min < 60 * 36 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} days`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/** One call to LinkedIn and what it answered. It never holds the access token. */
export interface AttemptStep {
  step: string; method: string; host: string; path: string;
  status?: number; headers?: Record<string, string>; body?: string; error?: string; at: string; ms: number;
}
/** One trip to LinkedIn for a job. A job retried by hand has several. */
export interface Attempt {
  id: string; jobId: string; startedAt: string; finishedAt: string;
  outcome: JobStatus; error?: string; steps: AttemptStep[];
}
