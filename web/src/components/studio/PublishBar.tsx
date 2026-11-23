import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, Send, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Draft } from "@/lib/draft";
import { defaultTimezone, toLocalInput, type Job } from "@/lib/jobs";
import type { Serialized } from "@/lib/linkedin";
import type { Size } from "@/lib/sizes";
import { ScheduleFields, resolveSchedule } from "./ScheduleFields";

type Step = "idle" | "confirm" | "schedule";

/** The next half hour, an hour or more from now: a sensible default for "later". */
const suggested = (tz: string) => toLocalInput(new Date(Math.ceil((Date.now() + 3600_000) / 1_800_000) * 1_800_000), tz);

/**
 * Publish or schedule the post being previewed. It lives inside the full preview, so what is confirmed here is what was
 * just shown. Nothing is sent until a second, explicit confirmation.
 */
export function PublishBar({ draft, serialized, bodyOnly, size, renderPng, onDone, onOpenSettings }: {
  draft: Draft;
  serialized: Serialized;
  /** The post text without the hashtag line (the server adds hashtags itself). */
  bodyOnly: string;
  /** The LinkedIn card size to render. */
  size: Size;
  renderPng: (size: Size) => Promise<Blob>;
  onDone: (job: Job, how: "now" | "scheduled") => void;
  onOpenSettings: () => void;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ ready: boolean; author: string } | null>(null);
  const [tz, setTz] = useState(defaultTimezone());
  const [local, setLocal] = useState(() => suggested(defaultTimezone()));

  // is LinkedIn set up? (token and author are enough to publish)
  useEffect(() => {
    let live = true;
    api.getSettings().then((v) => {
      if (!live) return;
      const f = (k: string) => v.networks.find((n) => n.id === "linkedin")?.fields.find((x) => x.key === k);
      setSetup({ ready: !!f("accessToken")?.set && !!f("authorUrn")?.set, author: f("authorUrn")?.value ?? "" });
    }).catch(() => live && setSetup({ ready: false, author: "" }));
    return () => { live = false; };
  }, []);

  if (draft.kind === "article") {
    return <p className="text-xs text-muted-foreground">Articles are not published from here: copy the formatted text into LinkedIn's article editor or your blog.</p>;
  }

  const empty = !serialized.text.trim();
  const blocked = empty ? "The post has no text." : serialized.overLimit ? "The post is over LinkedIn's length limit." : null;
  const schedule = resolveSchedule(local, tz);

  const submit = async (when?: { at: Date; tz: string }) => {
    setBusy(true); setError(null);
    try {
      const png = await renderPng(size);
      const job = await api.createJob({
        profileId: draft.profileId, draftId: draft.id, body: bodyOnly, hashtags: draft.hashtags, altText: draft.altText,
        ...(when ? { scheduledAt: when.at.toISOString().replace(/\.\d{3}Z$/, "Z"), timezone: when.tz } : {}),
      }, png);
      onDone(job, when ? "scheduled" : "now");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (!setup) return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking LinkedIn setup…</p>;

  if (!setup.ready) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        <span className="flex-1 text-muted-foreground">LinkedIn is not set up yet: publishing needs an access token and an author URN.</span>
        <Button size="sm" variant="outline" onClick={onOpenSettings}><Settings /> Set up LinkedIn</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3" aria-label="Publish">
      {step === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 text-xs text-muted-foreground">{blocked ?? "Nothing is sent until you confirm."}</span>
          <Button size="sm" variant="outline" disabled={!!blocked} onClick={() => { setError(null); setStep("schedule"); }}><CalendarClock /> Schedule…</Button>
          <Button size="sm" variant="brand" disabled={!!blocked} onClick={() => { setError(null); setStep("confirm"); }}><Send /> Publish now…</Button>
        </div>
      )}

      {step === "confirm" && (
        <div role="alertdialog" aria-label="Confirm publishing" className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium">Post this to LinkedIn now?</p>
          <p className="text-muted-foreground">It goes live immediately{setup.author ? <> as <code className="font-mono">{setup.author}</code></> : ""}, with the card image shown above. It cannot be unpublished from here.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStep("idle")}>Back</Button>
            <Button size="sm" variant="brand" disabled={busy} onClick={() => void submit()}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Yes, publish now</Button>
          </div>
        </div>
      )}

      {step === "schedule" && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <p className="text-xs font-medium">Schedule for later</p>
          <ScheduleFields idPrefix="new" local={local} tz={tz} onLocal={setLocal} onTz={setTz} />
          <p className="text-[11px] text-muted-foreground">The server must be running at that time. If it was not, you will be asked what to do instead of it posting late.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setStep("idle")}>Back</Button>
            <Button size="sm" variant="brand" disabled={busy || !!schedule.problem || !schedule.at} onClick={() => schedule.at && void submit({ at: schedule.at, tz })}>
              {busy ? <Loader2 className="animate-spin" /> : <CalendarClock />} Schedule post
            </Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
