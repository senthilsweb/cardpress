import { CheckCircle2, CircleAlert, CircleSlash, History, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage, ReplyReport } from "@/lib/chat";
import { checkLine, hasOutcome, savedLine } from "@/lib/reply";

/** The assistant's short answer, in place of everything it wrote while working. */
export function ReplyWords({ reports }: { reports: ReplyReport[] }) {
  return (
    <div className="space-y-2.5">
      {reports.map((r, i) => (
        <div key={i} className="space-y-1">
          <p className={r.outcome === "not_done" ? "flex gap-1.5" : undefined}>
            {r.outcome === "not_done" && <TriangleAlert aria-label="Not done" className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400" />}
            <span>{r.message}</span>
          </p>
          {r.points && r.points.length > 0 && <ul className="list-disc space-y-0.5 pl-4">{r.points.map((p, j) => <li key={j}>{p}</li>)}</ul>}
          {r.question && <p className="font-medium">{r.question}</p>}
          {r.next && <p className="text-muted-foreground">Next: {r.next}</p>}
        </div>
      ))}
    </div>
  );
}

/**
 * What came of a reply, under its words: what was saved (each opens that version), how the check went, why it failed,
 * and what the assistant did.
 */
export function ReplyCard({ message, onVersion }: { message: ChatMessage; onVersion: (draftId: string, version: number) => void }) {
  const d = message.detail;
  const failed = message.status === "failed";
  // a reply that is only words has no card under it
  if (!failed && message.status !== "stopped" && !hasOutcome(d)) return null;
  return (
    <div className="max-w-[92%] space-y-2 rounded-lg border border-border bg-card p-2.5 text-xs" aria-label="What came of the reply">
      {failed && (
        <div role="status" className="flex gap-1.5 text-destructive">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <p><b>The reply failed.</b> {d?.error}</p>
        </div>
      )}
      {message.status === "stopped" && <p className="flex items-center gap-1.5 text-muted-foreground"><CircleSlash className="h-3.5 w-3.5" /> Stopped</p>}
      {d?.saved && d.saved.some((s) => s.version) && (
        <div className="flex flex-wrap gap-1.5">
          {d.saved.filter((s) => s.version).map((s) => (
            <Button key={s.draftId} variant="outline" size="sm" title="Open this version" onClick={() => onVersion(s.draftId, s.version!)}><History /> {savedLine(s)}</Button>
          ))}
        </div>
      )}
      {d?.checks?.map((c, i) => (
        <div key={i} className={c.passed ? "flex gap-1.5 text-brand" : "flex gap-1.5 text-amber-700 dark:text-amber-400"}>
          {c.passed ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />}
          <p><b>{checkLine(c)}</b>{c.note ? <span className="text-muted-foreground"> {c.note}</span> : null}</p>
        </div>
      ))}
      {d?.steps && d.steps.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">What it did</summary>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted-foreground">{d.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </details>
      )}
    </div>
  );
}
