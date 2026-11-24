import { useMemo, useState } from "react";
import JSZip from "jszip";
import { Check, Copy, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyFormatted } from "@/lib/clipboard";
import type { DocNode } from "@/lib/draft";
import { downloadBlob } from "@/lib/export";
import { toLinkedInArticle } from "@/lib/linkedinArticle";
import { slugify } from "@/lib/slug";

const dataUrlToBlob = async (u: string) => (await fetch(u)).blob();

/**
 * An article as LinkedIn's article editor takes it: the title for its own field, the body with only what an article can
 * hold, and the pictures as files. LinkedIn has no way to receive an article from here, so it is pasted in by hand.
 */
export function LinkedInArticleDialog({ open, onOpenChange, doc, title }: { open: boolean; onOpenChange: (o: boolean) => void; doc: DocNode; title: string }) {
  const a = useMemo(() => (open ? toLinkedInArticle(doc, title) : null), [open, doc, title]);
  const [done, setDone] = useState<string | null>(null);
  const flash = (m: string) => { setDone(m); window.setTimeout(() => setDone(null), 2200); };
  if (!a) return null;
  const name = slugify(a.title || title || "article", "article");

  const copyTitle = async () => { try { await navigator.clipboard.writeText(a.title); flash("Title copied"); } catch { flash("Could not copy"); } };
  const copyBody = async () => {
    try { flash((await copyFormatted(a.html, a.text)) === "rich" ? "Body copied" : "Body copied as plain text"); } catch { flash("Could not copy"); }
  };
  const pictures = async () => {
    const zip = new JSZip();
    for (const p of a.pictures) zip.file(p.name, await dataUrlToBlob(p.dataUrl));
    zip.file("pictures.txt", a.pictures.map((p, i) => `Picture ${i + 1}: ${p.name}${p.alt ? ` (${p.alt})` : ""}`).join("\n") + "\n");
    downloadBlob(await zip.generateAsync({ type: "blob" }), `${name}-pictures.zip`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>For LinkedIn</DialogTitle>
          <DialogDescription>Paste into LinkedIn's article editor. It cannot be sent from here.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 p-5 text-sm">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Title</p>
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 break-words font-medium">{a.title || <span className="text-muted-foreground">No title yet</span>}</p>
              <Button size="sm" variant="outline" onClick={() => void copyTitle()} disabled={!a.title}><Copy /> Copy</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Body</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 text-muted-foreground">{a.text.length.toLocaleString()} characters</span>
              <Button size="sm" variant="brand" onClick={() => void copyBody()} disabled={!a.html}><Copy /> Copy body</Button>
            </div>
          </div>
          {a.pictures.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Pictures</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-muted-foreground">{a.pictures.length} to add by hand</span>
                <Button size="sm" variant="outline" onClick={() => void pictures()}><Download /> Download .zip</Button>
              </div>
            </div>
          )}
          {a.notes.length > 0 && (
            <ul className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs" aria-label="What changed">
              {a.notes.map((n) => <li key={n} className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span>{n}</span></li>)}
            </ul>
          )}
        </div>
        <DialogFooter>
          {done && <span className="mr-auto flex items-center gap-1 text-xs text-brand"><Check className="h-3.5 w-3.5" />{done}</span>}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
