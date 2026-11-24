import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ExternalLink, Loader2, Send, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { defaultTimezone, formatInZone, relative, STATUS_LABEL, toLocalInput, type Job } from "@/lib/jobs";
import type { JobsStore } from "@/lib/useJobs";
import { ScheduleFields, resolveSchedule } from "./ScheduleFields";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

/** A small preview of the image that will be (or was) posted. */
function Thumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | undefined;
    let live = true;
    api.jobImage(id).then((b) => { if (live) { url = URL.createObjectURL(b); setSrc(url); } }).catch(() => undefined);
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id]);
  return src
    ? <img src={src} alt="" className="h-12 w-20 shrink-0 rounded border border-border object-cover" />
    : <div className="h-12 w-20 shrink-0 rounded border border-border bg-muted" aria-hidden />;
}

function StatusBadge({ s }: { s: Job["status"] }) {
  if (s === "failed") return <Badge className="border-transparent bg-destructive/15 text-destructive">{STATUS_LABEL[s]}</Badge>;
  if (s === "missed" || s === "needs_review") return <Badge variant="warn">{STATUS_LABEL[s]}</Badge>;
  if (s === "published" || s === "scheduled" || s === "publishing") return <Badge variant="brand">{STATUS_LABEL[s]}</Badge>;
  return <Badge variant="outline">{STATUS_LABEL[s]}</Badge>;
}

function When({ j }: { j: Job }) {
  if (j.status === "publishing") return <>Sending to LinkedIn…</>;
  if (j.status === "published" && j.publishedAt) return <>Posted {formatInZone(j.publishedAt)}</>;
  if (j.scheduledAt) {
    return <>{formatInZone(j.scheduledAt, j.timezone)}{j.status === "scheduled" ? ` · ${relative(j.scheduledAt)}` : ""}</>;
  }
  return <>Created {formatInZone(j.createdAt)}</>;
}

function JobRow({ job, store }: { job: Job; store: JobsStore }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [resched, setResched] = useState(false);
  const [tz, setTz] = useState(job.timezone || defaultTimezone());
  const [local, setLocal] = useState(() => toLocalInput(new Date(Math.max(Date.now(), job.scheduledAt ? new Date(job.scheduledAt).getTime() : 0) + 3600_000), job.timezone || defaultTimezone()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null); setConfirm(null);
    try { await fn(); setResched(false); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  // a two-step click for anything that sends a post: the first click asks, the second does it
  const ask = (key: string, fn: () => Promise<unknown>) => () => {
    if (confirm !== key) { setConfirm(key); window.setTimeout(() => setConfirm((c) => (c === key ? null : c)), 4000); return; }
    void run(fn);
  };
  const sched = resolveSchedule(local, tz);
  const s = job.status;

  return (
    <li className="space-y-2 rounded-md border border-border bg-card p-2.5">
      <div className="flex gap-2.5">
        <Thumb id={job.id} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge s={s} />
            {s === "publishing" && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" aria-label="Publishing" />}
            <span className="text-[11px] text-muted-foreground"><When j={job} /></span>
          </div>
          <p className="line-clamp-2 text-xs leading-snug">{job.previewText.replace(/\s+/g, " ").trim()}</p>
        </div>
      </div>

      {job.error && (s === "failed" || s === "missed" || s === "needs_review") && (
        <p className="flex gap-1.5 text-[11px] leading-snug text-amber-700 dark:text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{job.error}</p>
      )}
      {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}

      {resched && (
        <div className="space-y-2 rounded-md border border-border p-2">
          <ScheduleFields idPrefix={`r-${job.id}`} local={local} tz={tz} onLocal={setLocal} onTz={setTz} />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setResched(false)}>Back</Button>
            <Button size="sm" variant="brand" disabled={busy || !!sched.problem || !sched.at}
              onClick={() => sched.at && void run(() => store.reschedule(job.id, sched.at!.toISOString().replace(/\.\d{3}Z$/, "Z"), tz))}>
              {busy ? <Loader2 className="animate-spin" /> : <CalendarClock />} Save time
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {s === "published" && job.postUrl && (
          <a href={job.postUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand hover:underline">View on LinkedIn <ExternalLink className="h-3 w-3" /></a>
        )}
        {(s === "scheduled" || s === "missed" || s === "failed") && (
          <Button size="sm" variant={confirm === "now" ? "brand" : "outline"} disabled={busy} onClick={ask("now", () => store.publishNow(job.id))}>
            <Send /> {confirm === "now" ? "Confirm: post now" : s === "failed" ? "Publish again" : "Publish now"}
          </Button>
        )}
        {s === "needs_review" && (
          <>
            <a href="https://www.linkedin.com/feed/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-brand hover:underline">Open LinkedIn <ExternalLink className="h-3 w-3" /></a>
            <Button size="sm" variant={confirm === "dup" ? "destructive" : "outline"} disabled={busy} onClick={ask("dup", () => store.publishNow(job.id, true))}>
              {confirm === "dup" ? "Confirm: may duplicate" : "Publish anyway…"}
            </Button>
          </>
        )}
        {(s === "scheduled" || s === "missed" || s === "failed" || s === "cancelled") && !resched && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setResched(true)}><CalendarClock /> {s === "cancelled" ? "Schedule again" : "Reschedule"}</Button>
        )}
        {s === "scheduled" && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => store.cancel(job.id))}><X /> Cancel</Button>
        )}
        {s !== "scheduled" && s !== "publishing" && (
          <Button size="sm" variant="ghost" disabled={busy} className="ml-auto" title={s === "published" ? "Remove from this list. The post stays on LinkedIn." : "Discard"} onClick={() => void run(() => store.remove(job.id))}>
            <Trash2 /> {s === "published" ? "Remove" : "Discard"}
          </Button>
        )}
        {s === "published" && <Check className="h-3.5 w-3.5 text-brand" aria-hidden />}
      </div>
    </li>
  );
}

/** Scheduled, running and finished posts. Every action here acts on a post that was already confirmed in the preview. */
export function JobQueue({ store }: { store: JobsStore }) {
  const [all, setAll] = useState(false);
  const jobs = all ? store.jobs : store.jobs.slice(0, 5);
  if (!store.loaded) return <p className="text-xs text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-2">
      {store.error && <p role="alert" className="text-xs text-destructive">{store.error}</p>}
      {store.jobs.length === 0 ? (
        <p className="text-xs leading-snug text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="space-y-2">{jobs.map((j) => <JobRow key={j.id} job={j} store={store} />)}</ul>
      )}
      {store.jobs.length > 5 && (
        <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${store.jobs.length}`}</Button>
      )}
    </div>
  );
}
