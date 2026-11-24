import { useState } from "react";
import { ExternalLink, Globe, Loader2, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Draft } from "@/lib/draft";
import { pagePath } from "@/lib/library";

/**
 * The public page of an approved item: a page rendered on the server, with the tags a search engine or a social network
 * reads. It is a deliberate step, off until published, and any change to the item takes it down until it is approved
 * and published again.
 */
export function PageBar({ draft, renderCover, onPublish, onUnpublish }: {
  draft: Draft;
  /** Draws the card as a PNG, which becomes the page's preview image. */
  renderCover: () => Promise<Blob>;
  onPublish: (meta: { slug?: string; summary?: string }, cover?: Blob) => Promise<void>;
  onUnpublish: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(draft.slug ?? "");
  const [summary, setSummary] = useState(draft.summary ?? "");
  const path = pagePath({ kind: draft.kind, slug: draft.slug, pageAt: draft.pageAt });
  const section = draft.kind === "article" ? "articles" : "posts";
  const live = path !== null;

  if (draft.status === "draft") {
    return <p className="text-xs text-muted-foreground">Approve this {draft.kind} to give it a public page.</p>;
  }

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true); setError(null);
    try { await fn(); toast.success(done); setOpen(false); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); } finally { setBusy(false); }
  };
  const publish = () => run(async () => {
    let cover: Blob | undefined;
    try { cover = await renderCover(); } catch { /* a page without a preview image is still a page */ }
    await onPublish({ slug: slug.trim() || undefined, summary: summary.trim() || undefined }, cover);
  }, live ? "Page updated" : "Page is live");

  return (
    <div className="space-y-2" aria-label="Public page">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-muted-foreground">
          {live ? <>Live at <a className="text-brand hover:underline" href={path!} target="_blank" rel="noopener noreferrer">{path} <ExternalLink className="inline h-3 w-3" /></a></> : "Not on the web."}
        </span>
        <Button size="sm" variant={live ? "outline" : "brand"} disabled={busy} onClick={() => { setSlug(draft.slug ?? ""); setSummary(draft.summary ?? ""); setOpen((v) => !v); }}>
          {live ? "Update page" : "Publish page…"}
        </Button>
        {live && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(onUnpublish, "Page taken down")}><EyeOff /> Take down</Button>}
      </div>
      {open && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3 text-xs">
          <div className="space-y-1">
            <label htmlFor="page-slug" className="font-medium">Address</label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">/{section}/</span>
              <Input id="page-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="made from the title" className="h-8" maxLength={80} />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="page-summary" className="font-medium">Description</label>
            <Textarea id="page-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={300} placeholder="Shown in search results and link previews. Left empty, it is the first paragraph." />
          </div>
          <p className="text-muted-foreground">Anyone with the address can read it. A change to the {draft.kind} takes it down until you approve and publish again.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Back</Button>
            <Button size="sm" variant="brand" disabled={busy} onClick={() => void publish()}>{busy ? <Loader2 className="animate-spin" /> : <Globe />} {live ? "Update" : "Publish"}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
