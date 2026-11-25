import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Draft } from "@/lib/draft";
import { DraftPicker } from "./DraftPicker";
import { cn } from "@/lib/utils";

export type StageView = "post" | "article" | "both";
const NAMES: Record<StageView, string> = { post: "Post", article: "Article", both: "Both" };

/** Above the canvas: which of the post and the article is shown, and which item is being worked on. */
export function StageBar({ views, view, changed, onView, drafts, currentId, onPick, onNew }: {
  /** The views that exist for what is open. */
  views: StageView[];
  view: StageView;
  /** Views that changed while another was shown. */
  changed: StageView[];
  onView: (v: StageView) => void;
  drafts: Draft[]; currentId: string; onPick: (id: string) => void; onNew: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2">
      <div className="flex rounded-md border border-border bg-card p-0.5" role="group" aria-label="View">
        {views.map((v) => (
          <button key={v} type="button" aria-pressed={v === view} onClick={() => onView(v)}
            className={cn("relative cursor-pointer rounded px-3 py-1 text-xs font-semibold", v === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {NAMES[v]}
            {changed.includes(v) && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand"><span className="sr-only"> changed</span></span>}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <div className="w-[min(320px,60vw)]">
        <DraftPicker drafts={drafts} currentId={currentId} onPick={onPick} />
      </div>
      <Button variant="ghost" size="icon-sm" title="New draft" aria-label="New draft" onClick={onNew}><Plus /></Button>
    </div>
  );
}
