import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Draft } from "@/lib/draft";
import { sizeById } from "@/lib/sizes";
import type { Design, Palette, Profile } from "@/lib/types";
import { DocView } from "./DocView";
import { ScaledCard } from "./preview";

/** An article as a reader meets it: the card as its cover, the title, the summary and the text. Not editable here. */
export function ArticleView({ draft, design, profile, palette, width, onEdit, onPreview }: {
  draft: Draft; design: Design; profile: Profile; palette: Palette;
  /** The room there is, in pixels. */
  width: number;
  onEdit: () => void; onPreview: () => void;
}) {
  const title = draft.title || design.title;
  const column = Math.max(240, Math.min(width - 48, 720));
  return (
    <div className="mx-auto py-6" style={{ width: column }}>
      <div className="mb-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onPreview}><Eye /> Preview and copy</Button>
        <Button variant="brand" size="sm" onClick={onEdit}><Pencil /> Edit</Button>
      </div>
      <article className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_8px_30px_rgba(0,0,0,0.08)]" aria-label="Article">
        <ScaledCard design={design} profile={profile} palette={palette} size={sizeById(design.sizeId)} maxW={column - 2} maxH={440} rounded={false} />
        <div className="space-y-3 p-6">
          {title && <h1 className="text-2xl font-bold leading-tight">{title}</h1>}
          {draft.summary && <p className="text-sm text-muted-foreground">{draft.summary}</p>}
          <DocView doc={draft.doc} kind="article" />
        </div>
      </article>
    </div>
  );
}
