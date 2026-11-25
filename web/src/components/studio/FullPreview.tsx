import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FeedFrame, ScaledCard } from "./preview";
import { copyFormatted } from "@/lib/clipboard";
import { fold, FOLD_CHARS, FOLD_LINES, LINKEDIN_LIMIT, type Serialized } from "@/lib/linkedin";
import { sizeById, SIZES, type Size } from "@/lib/sizes";
import type { Draft } from "@/lib/draft";
import type { Design, Palette, Profile } from "@/lib/types";

/** The LinkedIn size to show: the current one when it is a LinkedIn size, otherwise the standard post image. */
export function linkedinSize(current: Size): Size {
  return current.net === "LinkedIn" ? current : SIZES.find((s) => s.net === "LinkedIn") ?? sizeById("li-post");
}

/**
 * Everything that will be sent, shown before it is sent. Publish and schedule actions belong in `actions`
 * (the LinkedIn publishing change adds them), so they can only be reached from here.
 */
export function FullPreview(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Draft;
  serialized: Serialized;
  /** HTML of the article, from the editor. */
  articleHtml: string;
  design: Design;
  profile: Profile;
  palette: Palette;
  size: Size;
  actions?: ReactNode;
  /** The post's own file, when it has one: shown in place of the card. */
  image?: string;
}) {
  const { draft, serialized: s } = props;
  const [copied, setCopied] = useState<string | null>(null);
  const flash = (m: string) => { setCopied(m); window.setTimeout(() => setCopied(null), 2200); };
  const isPost = draft.kind === "post";
  const empty = !s.text.trim();

  const copy = async () => {
    try {
      if (isPost) { await navigator.clipboard.writeText(s.text); flash("Text copied"); }
      else flash((await copyFormatted(props.articleHtml, s.text)) === "rich" ? "Copied with formatting" : "Copied as plain text");
    } catch {
      flash("Could not copy");
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Full preview · {isPost ? "LinkedIn post" : "Article"}</DialogTitle>
          <DialogDescription>{isPost ? draft.attachment === "document" ? "This is exactly the text and document that would be sent." : "This is exactly the text and image that would be sent." : "The card and the article as they are saved. Articles are pasted into LinkedIn's article editor or your blog; they are not sent."}</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_240px]">
          <div className="flex justify-center">
            {isPost ? (
              <FeedFrame design={props.design} profile={props.profile} palette={props.palette} size={linkedinSize(props.size)} width={460} caption={s.text} expandable mediaSrc={props.image} documentTitle={draft.attachment === "document" ? draft.attachmentTitle ?? "" : undefined} />
            ) : (
              <div className="w-full max-w-xl space-y-4">
                <div className="flex justify-center">
                  <ScaledCard design={props.design} profile={props.profile} palette={props.palette} size={linkedinSize(props.size)} maxW={560} maxH={320} />
                </div>
                <article className="article-html w-full rounded-lg border border-border bg-card p-5" dangerouslySetInnerHTML={{ __html: props.articleHtml || "<p>Nothing written yet.</p>" }} />
              </div>
            )}
          </div>

          <aside className="space-y-3 text-sm" aria-label="Checks">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={s.overLimit ? "warn" : "outline"}>{s.length.toLocaleString()}{isPost ? ` / ${LINKEDIN_LIMIT.toLocaleString()}` : ""} chars</Badge>
              {isPost && draft.hashtags.length > 0 && <Badge variant="outline">{draft.hashtags.length} hashtags</Badge>}
            </div>
            {isPost && (
              <>
                <Check2 ok={!s.overLimit} text={s.overLimit ? `Over LinkedIn's ${LINKEDIN_LIMIT.toLocaleString()} character limit` : "Within the length limit"} />
                <Check2 ok={!empty && !fold(s.text).truncated} text={empty ? "The post has no text" : fold(s.text).truncated ? `Cut after about ${FOLD_LINES} lines or ${FOLD_CHARS} characters (“…see more”)` : "Fits without a “see more” cut"} />
                {draft.attachment === "document"
                  ? <Check2 ok={!!draft.attachmentTitle?.trim()} text={draft.attachmentTitle?.trim() ? "Document has a title" : "The document needs a title"} />
                  : <Check2 ok={draft.altText.trim() !== ""} text={draft.altText.trim() ? "Image has alt text" : "No alt text for the image"} />}
              </>
            )}
            {isPost && s.warnings.map((w) => <Check2 key={w.code} ok={false} text={w.message} />)}
          </aside>
        </div>

        {props.actions && <div className="border-t border-border px-5 py-3">{props.actions}</div>}

        <DialogFooter>
          {copied && <span className="mr-auto flex items-center gap-1 text-xs text-brand"><Check className="h-3.5 w-3.5" />{copied}</span>}
          <Button variant="outline" size="sm" onClick={copy} disabled={empty}><Copy /> {isPost ? "Copy text" : "Copy formatted"}</Button>
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Check2({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={ok ? "flex gap-2 text-xs text-muted-foreground" : "flex gap-2 text-xs text-amber-700 dark:text-amber-400"}>
      {ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>{text}</span>
    </p>
  );
}
