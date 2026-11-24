import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Copy, Eye, FileText, Maximize2, Minimize2, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AreaField, Field, Section } from "./fields";
import { RichEditor } from "./RichEditor";
import { FullPreview, linkedinSize } from "./FullPreview";
import { PublishBar } from "./PublishBar";
import { JobQueue } from "./JobQueue";
import type { JobsStore } from "@/lib/useJobs";
import { copyFormatted } from "@/lib/clipboard";
import { useLayout } from "@/lib/layout";
import { normalizeHashtag, type DraftKind } from "@/lib/draft";
import { LINKEDIN_LIMIT, serializeDraft, serializeForLinkedIn } from "@/lib/linkedin";
import { CAPTION_LIMITS, NETWORKS, type Size } from "@/lib/sizes";
import { formatInZone, type Job } from "@/lib/jobs";
import { toast } from "sonner";
import type { DraftStore } from "@/lib/useDrafts";
import type { Design, Palette, Profile } from "@/lib/types";

const label = (text: string) => (text.split("\n")[0] || "Empty draft").slice(0, 34);

export function Composer({ store, jobs, brandNames, renderPng, onOpenSettings, design, profile, palette, size, expanded, setExpanded, host }: {
  store: DraftStore; design: Design; profile: Profile; palette: Palette; size: Size;
  /** Scheduled and published posts. */
  jobs: JobsStore;
  /** Every active brand's name by id (for the queue's "All brands" view). */
  brandNames: Record<string, string>;
  /** Draws the card as a PNG at a size (the same renderer as Download). */
  renderPng: (size: Size) => Promise<Blob>;
  onOpenSettings: () => void;
  /** The editor takes over the centre of the studio. `host` is the element it is drawn into. */
  expanded: boolean; setExpanded: (v: boolean) => void; host: HTMLElement | null;
}) {
  const { current: draft, drafts } = store;
  const { editorHeight, setEditorHeight } = useLayout();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [preview, setPreview] = useState(false);
  const [tag, setTag] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const flash = (m: string) => { setNote(m); window.setTimeout(() => setNote(null), 2200); };
  const [busy, setBusy] = useState<string | null>(null);
  const guard = (fn: () => Promise<void>) => async () => {
    try { await fn(); } catch (e) { flash(e instanceof Error ? e.message : "Something went wrong"); }
  };

  // Esc collapses. The editor handles Escape itself, so listen before it does (capture), and step aside
  // when the preview dialog or a dropdown is open so Esc closes that first.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || preview || document.querySelector("[role=listbox], [role=menu]")) return;
      setExpanded(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded, preview, setExpanded]);

  const ser = useMemo(() => (draft ? serializeDraft(draft) : null), [draft]);
  const labels = useMemo(() => new Map(drafts.map((d) => [d.id, label(serializeDraft(d).text)])), [drafts]);
  if (!draft || !ser) return null;
  const isPost = draft.kind === "post";

  const addTag = () => {
    const t = normalizeHashtag(tag);
    setTag("");
    if (t && !draft.hashtags.some((h) => h.toLowerCase() === t.toLowerCase())) store.update({ hashtags: [...draft.hashtags, t] });
  };
  // what the server is sent: the text without the hashtag line, which it turns into real hashtags itself
  const bodyOnly = useMemo(() => (draft && draft.kind === "post" ? serializeForLinkedIn(draft.doc, { unicodeStyles: draft.unicodeStyles }).text : ""), [draft]);
  const onPublished = (job: Job, how: "now" | "scheduled") => {
    jobs.add(job);
    setPreview(false);
    setExpanded(false);
    if (how === "now") toast("Sending to LinkedIn…", { description: "You will be told when it is posted." });
    else toast.success("Post scheduled", { description: job.scheduledAt ? formatInZone(job.scheduledAt, job.timezone) : undefined });
  };
  const html = () => (editor && !editor.isDestroyed ? editor.getHTML() : "");
  const copyNow = async () => {
    try {
      if (isPost) { await navigator.clipboard.writeText(ser.text); flash("Text copied"); }
      else flash((await copyFormatted(html(), ser.text)) === "rich" ? "Copied with formatting" : "Copied as plain text");
    } catch { flash("Could not copy"); }
  };

  return (
    <>
      <Section
        title="Draft"
        action={
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" title="New draft" aria-label="New draft" disabled={busy === "new"} onClick={guard(async () => { setBusy("new"); try { await store.create(draft.kind); } finally { setBusy(null); } })}><Plus /></Button>
            <Button variant="ghost" size="icon-sm" title="Delete this draft" aria-label="Delete this draft" onClick={guard(() => store.remove(draft.id))}><Trash2 /></Button>
          </div>
        }
      >
        <Select value={draft.id} onValueChange={(id) => void guard(() => store.select(id))()}>
          <SelectTrigger aria-label="Choose a draft"><SelectValue /></SelectTrigger>
          <SelectContent>
            {drafts.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.kind === "article" ? "Article · " : "Post · "}{labels.get(d.id)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Field label="Type" hint={isPost ? "A post is sent to LinkedIn with the card image." : "An article is copied with its formatting into LinkedIn's article editor or a blog."}>
          <ToggleGroup type="single" value={draft.kind} onValueChange={(v) => { if (v) store.setKind(v as DraftKind); }}>
            <ToggleGroupItem value="post">Post</ToggleGroupItem>
            <ToggleGroupItem value="article"><FileText className="mr-1 h-3.5 w-3.5" /> Article</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </Section>

      <Section
        id="post-text"
        title={isPost ? "Post text" : "Article"}
        action={
          <div className="flex items-center gap-2">
            <SaveBadge state={store.saveState} retry={store.retry} />
            <Button variant="ghost" size="icon-sm" title="Expand the editor over the studio" aria-label="Expand the editor" onClick={() => setExpanded(true)}><Maximize2 /></Button>
          </div>
        }
      >
        {expanded ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
            <span>Editing in the large view.</span>
            <Button variant="outline" size="sm" onClick={() => setExpanded(false)}><Minimize2 /> Collapse</Button>
          </div>
        ) : (
          // drag the bottom-right corner to make it taller or shorter; the height is remembered
          <div
            className="resize-y overflow-hidden rounded-md"
            style={{ height: editorHeight, minHeight: 190, maxHeight: "78vh" }}
            title="Drag the corner to resize"
            onMouseUp={(e) => {
              const el = e.currentTarget;
              if (el.style.height && Math.abs(el.offsetHeight - (editorHeight ?? 0)) > 3) setEditorHeight(Math.round(el.offsetHeight));
            }}
          >
            <RichEditor fill docKey={draft.id} kind={draft.kind} doc={draft.doc} onChange={(doc) => store.update({ doc })} onEditor={setEditor} />
          </div>
        )}
        <div className="flex flex-wrap gap-1.5" aria-label="Character counts">
          {isPost ? (
            NETWORKS.map((net) => (
              <Badge key={net} variant={ser.length > CAPTION_LIMITS[net] ? "warn" : "outline"}>{net} {ser.length}/{CAPTION_LIMITS[net].toLocaleString()}</Badge>
            ))
          ) : (
            <Badge variant="outline">{ser.length.toLocaleString()} characters</Badge>
          )}
        </div>
      </Section>

      {isPost && (
        <>
          <Section title="Hashtags">
            <div className="flex flex-wrap gap-1.5">
              {draft.hashtags.map((h) => (
                <span key={h} className="inline-flex items-center gap-1 rounded-md bg-accent py-0.5 pl-2 pr-1 text-xs text-brand">
                  #{h}
                  <button type="button" className="cursor-pointer rounded p-0.5 hover:bg-background/60" aria-label={`Remove #${h}`} onClick={() => store.update({ hashtags: draft.hashtags.filter((x) => x !== h) })}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <Input
              value={tag} placeholder="Type a hashtag and press Enter" aria-label="Add a hashtag"
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } else if (e.key === "Backspace" && !tag && draft.hashtags.length) store.update({ hashtags: draft.hashtags.slice(0, -1) }); }}
              onBlur={addTag}
            />
            <p className="text-[11px] leading-snug text-muted-foreground">Added as the last line.</p>
          </Section>

          <Section title="Image">
            <AreaField id="alt" label="Alt text" value={draft.altText} onChange={(v) => store.update({ altText: v })} rows={2} hint="For screen readers." />
          </Section>

          <Section title="Bold and italic">
            <div className="flex items-start gap-2">
              <Switch id="uni" checked={draft.unicodeStyles} onCheckedChange={(v) => store.update({ unicodeStyles: v })} />
              <div className="space-y-1">
                <Label htmlFor="uni" className="text-foreground">Keep bold and italic (Unicode)</Label>
              </div>
            </div>
          </Section>
        </>
      )}

      <Section title="Review">
        {ser.warnings.map((w) => <p key={w.code} className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">{w.message}</p>)}
        {isPost && ser.overLimit && <p className="text-[11px] text-destructive">Over LinkedIn's {LINKEDIN_LIMIT.toLocaleString()} character limit.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="brand" size="sm" onClick={() => setPreview(true)}><Eye /> Full preview</Button>
          <Button variant="outline" size="sm" onClick={copyNow} disabled={!ser.text.trim()}><Copy /> {isPost ? "Copy text" : "Copy formatted"}</Button>
          {note && <span className="text-xs text-brand">{note}</span>}
        </div>
      </Section>

      <Section id="queue" title="Publishing queue">
        <JobQueue store={jobs} brands={brandNames} />
      </Section>

      <FullPreview
        open={preview} onOpenChange={setPreview} draft={draft} serialized={ser}
        articleHtml={html()} design={design} profile={profile} palette={palette} size={size}
        actions={
          <PublishBar
            draft={draft} serialized={ser} bodyOnly={bodyOnly} size={linkedinSize(size)} renderPng={renderPng} onDone={onPublished} brandName={profile.name}
            onOpenSettings={() => { setPreview(false); onOpenSettings(); }}
          />
        }
      />

      {expanded && host && createPortal(
        <div className="flex h-full flex-col bg-background" role="region" aria-label="Expanded editor">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2.5">
            <span className="eyebrow">{isPost ? "Post text" : "Article"}</span>
            <span className="truncate text-xs text-muted-foreground">{labels.get(draft.id)}</span>
            <span className="flex-1" />
            {note && <span className="text-xs text-brand">{note}</span>}
            <SaveBadge state={store.saveState} retry={store.retry} />
            <Button variant="outline" size="sm" onClick={copyNow} disabled={!ser.text.trim()}><Copy /> {isPost ? "Copy text" : "Copy formatted"}</Button>
            <Button variant="brand" size="sm" onClick={() => setPreview(true)}><Eye /> Full preview</Button>
            <Button variant="outline" size="sm" onClick={() => setExpanded(false)} title="Back to the studio (Esc)"><Minimize2 /> Collapse</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="mx-auto w-full max-w-3xl space-y-3">
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <RichEditor large docKey={draft.id} kind={draft.kind} doc={draft.doc} onChange={(doc) => store.update({ doc })} onEditor={setEditor} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Character counts">
                {isPost
                  ? <Badge variant={ser.overLimit ? "warn" : "outline"}>LinkedIn {ser.length.toLocaleString()}/{LINKEDIN_LIMIT.toLocaleString()}</Badge>
                  : <Badge variant="outline">{ser.length.toLocaleString()} characters</Badge>}
                {isPost && draft.hashtags.length > 0 && <Badge variant="outline">{draft.hashtags.map((h) => `#${h}`).join(" ")}</Badge>}
                {ser.warnings.map((w) => <span key={w.code} className="text-[11px] text-amber-700 dark:text-amber-400">{w.message}</span>)}
              </div>
            </div>
          </div>
        </div>,
        host,
      )}
    </>
  );
}

function SaveBadge({ state, retry }: { state: DraftStore["saveState"]; retry: () => void }) {
  if (state === "error") {
    return <button type="button" className="cursor-pointer text-xs text-destructive underline" onClick={retry}>Not saved – retry</button>;
  }
  return <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" role="status">{state === "saving" ? "Saving…" : "Saved"}</span>;
}
