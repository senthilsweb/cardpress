import { CheckCircle2, CircleAlert, CircleSlash, History, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/chat";
import { checkLine, savedLine } from "@/lib/reply";

/**
 * What came of a reply, under its words: what was saved (each opens that version), how the check went, why it failed,
 * and what the assistant did.
 */
export function ReplyCard({ message, onVersion }: { message: ChatMessage; onVersion: (draftId: string, version: number) => void }) {
  const d = message.detail;
  const failed = message.status === "failed";
  if (!d && !failed) return null;
  return (
    <div className="max-w-[92%] space-y-2 rounded-lg border border-border bg-card p-2.5 text-xs" aria-label="What came of the reply">
      {failed && (
        <div role="status" className="flex gap-1.5 text-destructive">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <p><b>The reply failed.</b> {d?.error}</p>
        </div>
      )}
      {message.status === "stopped" && <p className="flex items-center gap-1.5 text-muted-foreground"><CircleSlash className="h-3.5 w-3.5" /> Stopped</p>}
      {d?.saved && d.saved.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {d.saved.map((s) => (
            <Button key={s.draftId} variant="outline" size="sm" title="Open this version" onClick={() => onVersion(s.draftId, s.version)}><History /> {savedLine(s)}</Button>
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
