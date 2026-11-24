import { useState } from "react";
import { CalendarClock, Check, Download, Share2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Draft } from "@/lib/draft";
import { defaultTimezone, formatInZone, toLocalInput } from "@/lib/jobs";
import { downloadBlob } from "@/lib/export";
import { articleHtmlPage, docToMarkdown } from "@/lib/markdown";
import { slugify } from "@/lib/slug";
import { useSession } from "@/lib/session";
import { ScheduleFields, resolveSchedule } from "./ScheduleFields";
import { LinkedInArticleDialog } from "./LinkedInArticleDialog";

/**
 * What an article gets instead of Publish: LinkedIn has no way to send one, so it is approved (marked final), can be given a
 * planned date, and is exported as Markdown or HTML to paste into LinkedIn's article editor or a site.
 */
export function ArticleBar({ draft, html, onApprove, onPlan }: {
  draft: Draft;
  /** The article body as HTML, from the editor. */
  html: () => string;
  onApprove: () => void | Promise<void>;
  onPlan: (plan: { scheduledAt?: string; timezone?: string }) => Promise<void>;
}) {
  const { can } = useSession();
  const [planning, setPlanning] = useState(false);
  const [forLinkedIn, setForLinkedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tz, setTz] = useState(defaultTimezone());
  const [local, setLocal] = useState(() => toLocalInput(new Date(Date.now() + 7 * 24 * 3600_000), defaultTimezone()));
  const sched = resolveSchedule(local, tz);
  const name = slugify(draft.title || "article", "article");

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  };
  const exportMd = () => downloadBlob(new Blob([docToMarkdown(draft.doc)], { type: "text/markdown;charset=utf-8" }), `${name}.md`);
  const exportHtml = () => downloadBlob(new Blob([articleHtmlPage(draft.title || "Article", html())], { type: "text/html;charset=utf-8" }), `${name}.html`);

  if (draft.status !== "approved") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex-1 text-muted-foreground">
          {draft.status === "draft" ? (can("approve") ? "Approve this article to mark it final." : "An editor or admin approves it.") : "This article is marked as published. Edit it to make a new version."}
        </span>
        {draft.status === "draft" && can("approve") && <Button size="sm" variant="brand" onClick={() => void onApprove()}><Check /> Approve</Button>}
        <Button size="sm" variant="outline" onClick={() => setForLinkedIn(true)}><Share2 /> For LinkedIn</Button>
        <Button size="sm" variant="outline" onClick={exportMd}><Download /> Markdown</Button>
        <Button size="sm" variant="outline" onClick={exportHtml}><Download /> HTML</Button>
        <LinkedInArticleDialog open={forLinkedIn} onOpenChange={setForLinkedIn} doc={draft.doc} title={draft.title} />
      </div>
    );
  }
  return (
    <div className="space-y-3" aria-label="Article">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex-1 text-muted-foreground">
          {draft.scheduledAt ? <>Planned for <b className="text-foreground">{formatInZone(draft.scheduledAt, draft.timezone)}</b>. Nothing is sent.</> : "Articles are not sent from here."}
        </span>
        {can("approve") && <Button size="sm" variant="outline" onClick={() => setPlanning((v) => !v)}><CalendarClock /> {draft.scheduledAt ? "Change date" : "Plan a date"}</Button>}
        <Button size="sm" variant="outline" onClick={() => setForLinkedIn(true)}><Share2 /> For LinkedIn</Button>
        <Button size="sm" variant="outline" onClick={exportMd}><Download /> Markdown</Button>
        <Button size="sm" variant="outline" onClick={exportHtml}><Download /> HTML</Button>
      </div>
      {planning && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <ScheduleFields verb="Planned for" idPrefix="plan" local={local} tz={tz} onLocal={setLocal} onTz={setTz} />
          <div className="flex justify-end gap-2">
            {draft.scheduledAt && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(async () => { await onPlan({}); setPlanning(false); })}><X /> Clear</Button>}
            <Button size="sm" variant="brand" disabled={busy || !!sched.problem || !sched.at}
              onClick={() => sched.at && void run(async () => { await onPlan({ scheduledAt: sched.at!.toISOString().replace(/\.\d{3}Z$/, "Z"), timezone: tz }); setPlanning(false); })}>
              {busy ? <Loader2 className="animate-spin" /> : <CalendarClock />} Save date
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <LinkedInArticleDialog open={forLinkedIn} onOpenChange={setForLinkedIn} doc={draft.doc} title={draft.title} />
    </div>
  );
}
