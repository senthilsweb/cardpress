import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { ArrowLeftRight, Check, Copy, Eye, FileText, History, ImageUp, Maximize2, Minimize2, Plus, Trash2, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AreaField, Field, Section } from "./fields";
import { EditorToolbar, Outline, RichEditor } from "./RichEditor";
import { FullPreview, linkedinSize } from "./FullPreview";
import { PublishBar } from "./PublishBar";
import { ArticleBar } from "./ArticleBar";
import { PageBar } from "./PageBar";
import { JobQueue } from "./JobQueue";
import type { JobsStore } from "@/lib/useJobs";
import { copyFormatted } from "@/lib/clipboard";
import { useLayout } from "@/lib/layout";
import { useSession } from "@/lib/session";
import { normalizeHashtag, type Draft, type DocNode, type DraftKind } from "@/lib/draft";
import { countWords, DEFAULT_SIZE_INDEX, parseSizeIndex, parseWidth, readingMinutes, stepSize, TEXT_SIZES, type TextWidth } from "@/lib/editorTools";
import { LINKEDIN_LIMIT, serializeDraft, serializeForLinkedIn } from "@/lib/linkedin";
import { CAPTION_LIMITS, NETWORKS, type Size } from "@/lib/sizes";
import { formatInZone, type Job } from "@/lib/jobs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { flushPendingEdits } from "@/lib/pendingEdits";
import { cn } from "@/lib/utils";
import type { DraftStore } from "@/lib/useDrafts";
import type { Design, Palette, Profile } from "@/lib/types";

const STATUS_NAME = { draft: "Draft", approved: "Approved", scheduled: "Scheduled", published: "Published" } as const;
const label = (text: string) => (text.split("\n")[0] || "Empty draft").slice(0, 34);

// A draft's label only changes when its document does, and the store keeps untouched documents as the same object, so
// every draft but the one being typed in is served from here instead of being serialised again on each keystroke.
const MAX_IMAGE_BYTES = 10 << 20; // the server refuses more

const labelCache = new WeakMap<object, string>();
const labelOf = (d: Draft) => {
  let l = labelCache.get(d.doc);
  if (l === undefined) { l = label(serializeDraft(d).text); labelCache.set(d.doc, l); }
  return l;
};

/** A saved view choice. Storage can be blocked or full, and the choice is only a convenience. */
const loadPref = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const savePref = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* not remembered */ } };

export function Composer({ onOpenHistory, openPreview, store, jobs, brandNames, renderPng, onOpenSettings, design, profile, palette, size, expanded, setExpanded, host }: {
  /** Open the item's history (versions). */
  onOpenHistory?: () => void;
  /** Open the Full preview as soon as this shows (asked for by the library). */
  openPreview?: boolean;
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
  const { can } = useSession();
  const { editorHeight, setEditorHeight } = useLayout();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [preview, setPreview] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [width, setWidth] = useState<TextWidth>(() => parseWidth(loadPref("cardpress.editor.width")));
  const [sizeIdx, setSizeIdx] = useState(() => parseSizeIndex(loadPref("cardpress.editor.size")));
  const [outlineOff, setOutlineOff] = useState(() => loadPref("cardpress.editor.outline") === "off");
  const chooseWidth = () => { const w: TextWidth = width === "narrow" ? "wide" : "narrow"; setWidth(w); savePref("cardpress.editor.width", w); };
  const chooseSize = (d: 1 | -1) => { const i = stepSize(sizeIdx, d); setSizeIdx(i); savePref("cardpress.editor.size", String(i)); };
  const toggleOutline = useCallback(() => setOutlineOff((off) => { savePref("cardpress.editor.outline", off ? "on" : "off"); return !off; }), []);
  // kept as one element so the toolbar (memoised) is not drawn again on every keystroke
  const viewTools = useMemo(() => (draft?.kind === "post" ? undefined : (
    <>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      <ViewTool label={width === "narrow" ? "Wider text" : "Narrower text"} on={width === "wide"} onClick={chooseWidth}><ArrowLeftRight /></ViewTool>
      <ViewTool label="Smaller text" disabled={sizeIdx === 0} onClick={() => chooseSize(-1)}><span className="text-[11px] font-semibold">A-</span></ViewTool>
      <ViewTool label="Larger text" disabled={sizeIdx === TEXT_SIZES.length - 1} onClick={() => chooseSize(1)}><span className="text-sm font-semibold">A+</span></ViewTool>
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
    </>
  )), [draft?.kind, width, sizeIdx]); // eslint-disable-line react-hooks/exhaustive-deps
  const openFull = () => { flushPendingEdits(); setPreview(true); };
  const collapse = () => { flushPendingEdits(); setExpanded(false); };
  useEffect(() => { if (openPreview) { flushPendingEdits(); setPreview(true); } }, [openPreview]);
  const [tag, setTag] = useState("");
  // the post's own picture, when it has one, as an address the page can show
  const ownImage = draft?.kind === "post" && draft.attachment === "image";
  const [ownSrc, setOwnSrc] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!ownImage || !draft) { setOwnSrc(undefined); return; }
    let live = true, url: string | undefined;
    api.attachmentImage(draft.id).then((b) => { if (live) { url = URL.createObjectURL(b); setOwnSrc(url); } }).catch(() => undefined);
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [ownImage, draft?.id, draft?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [note, setNote] = useState<string | null>(null);
  const flash = (m: string) => { setNote(m); window.setTimeout(() => setNote(null), 2200); };
  const [busy, setBusy] = useState<string | null>(null);
  // typing in an article reaches the store after a short pause; whatever acts on the draft takes what is waiting first
  const guard = (fn: () => Promise<void>) => async () => {
    flushPendingEdits();
    try { await fn(); } catch (e) { flash(e instanceof Error ? e.message : "Something went wrong"); }
  };

  // Esc collapses. The editor handles Escape itself, so listen before it does (capture), and step aside
  // when the preview dialog or a dropdown is open so Esc closes that first.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || preview || document.querySelector("[role=listbox], [role=menu]")) return;
      flushPendingEdits();
      setExpanded(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [expanded, preview, setExpanded]);

  // a post sent from the open draft changes the draft behind the screen (scheduled, then published): look again when the queue moves
  const queueKey = jobs.jobs.map((j) => `${j.id}:${j.status}`).join(",");
  useEffect(() => { void store.refreshStatus(); }, [queueKey, draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ser = useMemo(() => {
    if (!draft) return null;
    const out = serializeDraft(draft);
    labelCache.set(draft.doc, label(out.text)); // the label below needs the same text, so it is not worked out twice
    return out;
  }, [draft]);
  const labels = useMemo(() => new Map(drafts.map((d) => [d.id, labelOf(d)])), [drafts]);
  const words = useMemo(() => (ser ? countWords(ser.text) : 0), [ser]);
  if (!draft || !ser) return null;
  const isPost = draft.kind === "post";

  // approving is the step between writing and publishing: only an approved draft can be sent
  const approve = guard(async () => { await store.approve(); toast.success("Approved", { description: isPost ? "It can now be published or scheduled." : "It is marked final." }); });
  const unapprove = guard(async () => { await store.unapprove(); toast("Back to draft"); });

  const pickImage = guard(async () => {
    const f = fileRef.current?.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    if (f.size > MAX_IMAGE_BYTES) throw new Error("The image is over 10 MB.");
    await store.setAttachment(f);
    toast.success("Your image replaces the card", { description: "Approve the post again before publishing." });
  });
  const useCard = guard(async () => { await store.clearAttachment(); toast("The card goes out with this post"); });

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
  // the HTML of a long article with pictures is large, so it is made when asked for (the preview opening, a copy), never per keystroke
  // a hand-over that was written under another draft than the one open now is dropped rather than put into the wrong draft
  // the key is the one the editor was given (draft and revision), so it must be compared with that, not with the bare id
  const docKey = `${draft.id}:${store.rev}`;
  const onDoc = (doc: DocNode, key: string) => { if (key === docKey) store.update({ doc }); };
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
            {onOpenHistory && <Button variant="ghost" size="icon-sm" title="History" aria-label="History" onClick={onOpenHistory}><History /></Button>}
            <Button variant="ghost" size="icon-sm" title="New draft" aria-label="New draft" disabled={busy === "new"} onClick={guard(async () => { setBusy("new"); try { await store.create(draft.kind); } finally { setBusy(null); } })}><Plus /></Button>
            <Button variant="ghost" size="icon-sm" title={draft.status === "draft" ? "Delete this draft" : "Bring it back to draft to delete it"} aria-label="Delete this draft" disabled={draft.status !== "draft"} onClick={guard(() => store.remove(draft.id))}><Trash2 /></Button>
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
        {!isPost && (
          <Field label="Title" hint="Shown in the library and used for the file name.">
            <Input value={draft.title} maxLength={200} onChange={(e) => store.update({ title: e.target.value })} aria-label="Article title" disabled={draft.status === "scheduled"} />
          </Field>
        )}
        <Field label="Type" hint={isPost ? "A post is sent to LinkedIn with the card image." : "An article is copied with its formatting into LinkedIn's article editor or a blog."}>
          <ToggleGroup type="single" value={draft.kind} onValueChange={(v) => { if (v) { flushPendingEdits(); store.setKind(v as DraftKind); } }}>
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
            <Button variant="ghost" size="icon-sm" title="Expand the editor over the studio" aria-label="Expand the editor" onClick={() => { flushPendingEdits(); setExpanded(true); }}><Maximize2 /></Button>
          </div>
        }
      >
        {expanded ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-input p-3 text-xs text-muted-foreground">
            <span>Editing in the large view.</span>
            <Button variant="outline" size="sm" onClick={collapse}><Minimize2 /> Collapse</Button>
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
            <RichEditor fill readOnly={draft.status === "scheduled"} docKey={docKey} kind={draft.kind} doc={draft.doc} onChange={onDoc} onEditor={setEditor} />
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
            <div className="space-y-2" aria-label="Attachment">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={() => void pickImage()} aria-label="Choose an image" />
              {ownImage ? (
                <div className="flex items-center gap-2.5">
                  {ownSrc ? <img src={ownSrc} alt="" className="h-14 w-24 shrink-0 rounded border border-border object-cover" /> : <div className="h-14 w-24 shrink-0 rounded border border-border bg-muted" aria-hidden />}
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-xs text-muted-foreground">Your image goes out, not the card.</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" disabled={draft.status === "scheduled"} onClick={() => fileRef.current?.click()}><ImageUp /> Change</Button>
                      <Button variant="outline" size="sm" disabled={draft.status === "scheduled"} onClick={useCard}>Use the card</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-xs text-muted-foreground">The card goes out with the post.</span>
                  <Button variant="outline" size="sm" disabled={draft.status === "scheduled"} onClick={() => fileRef.current?.click()}><ImageUp /> Use your own image</Button>
                </div>
              )}
            </div>
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
        <div className="flex flex-wrap items-center gap-2" aria-label="Approval">
          <Badge variant={draft.status === "draft" ? "outline" : "brand"}>{STATUS_NAME[draft.status]}</Badge>
          {draft.status === "draft" && can("approve") && <Button variant="brand" size="sm" onClick={approve} disabled={!ser.text.trim() || (isPost && ser.overLimit)}><Check /> Approve</Button>}
          {draft.status === "draft" && !can("approve") && <span className="text-[11px] text-muted-foreground">An editor or admin approves it.</span>}
          {(draft.status === "approved" || draft.status === "published") && (
            <Button variant="outline" size="sm" onClick={unapprove}><Undo2 /> {draft.status === "published" ? "Edit again" : "Back to draft"}</Button>
          )}
          {draft.pageAt && <Badge variant="brand" title="This has a public page">Page live</Badge>}
          {draft.status === "scheduled" && <span className="text-[11px] text-muted-foreground">A post is waiting to be sent. Cancel it in the queue to edit.</span>}
        </div>
        {ser.warnings.map((w) => <p key={w.code} className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">{w.message}</p>)}
        {isPost && ser.overLimit && <p className="text-[11px] text-destructive">Over LinkedIn's {LINKEDIN_LIMIT.toLocaleString()} character limit.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="brand" size="sm" onClick={openFull}><Eye /> Full preview</Button>
          <Button variant="outline" size="sm" onClick={copyNow} disabled={!ser.text.trim()}><Copy /> {isPost ? "Copy text" : "Copy formatted"}</Button>
          {note && <span className="text-xs text-brand">{note}</span>}
        </div>
      </Section>

      <Section id="queue" title="Publishing queue">
        <JobQueue store={jobs} brands={brandNames} />
      </Section>

      <FullPreview
        image={ownImage ? ownSrc : undefined}
        open={preview} onOpenChange={setPreview} draft={draft} serialized={ser}
        articleHtml={preview ? html() : ""} design={design} profile={profile} palette={palette} size={size}
        actions={(
          <div className="space-y-3">
            {draft.kind === "article" ? (
              <ArticleBar draft={draft} html={html} onApprove={approve} onPlan={store.plan} />
            ) : (
              <PublishBar
                ownImage={ownImage}
                draft={draft} onApprove={approve} serialized={ser} bodyOnly={bodyOnly} size={linkedinSize(size)} renderPng={renderPng} onDone={onPublished} brandName={profile.name}
                onOpenSettings={() => { setPreview(false); onOpenSettings(); }}
              />
            )}
            {can("publish") && <div className="border-t border-border pt-3">
              <PageBar draft={draft} renderCover={() => renderPng(linkedinSize(size))} onPublish={store.publishPage} onUnpublish={store.unpublishPage} />
            </div>}
          </div>
        )}
      />

      {expanded && host && createPortal(
        <div className="flex h-full flex-col bg-background" role="region" aria-label="Expanded editor">
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-background px-4 py-2.5">
            <span className="eyebrow">{isPost ? "Post text" : "Article"}</span>
            <span className="truncate text-xs text-muted-foreground">{labels.get(draft.id)}</span>
            <span className="flex-1" />
            {note && <span className="text-xs text-brand">{note}</span>}
            <Button variant="outline" size="sm" onClick={copyNow} disabled={!ser.text.trim()}><Copy /> {isPost ? "Copy text" : "Copy formatted"}</Button>
            <Button variant="brand" size="sm" onClick={openFull}><Eye /> Full preview</Button>
            <Button variant="outline" size="sm" onClick={collapse} title="Back to the studio (Esc)"><Minimize2 /> Collapse</Button>
          </div>
          {/* the toolbar stays here, outside the scrolling text */}
          <div className="border-b border-border bg-card">
            <EditorToolbar
              editor={editor} kind={draft.kind} linkOpen={linkOpen} setLinkOpen={setLinkOpen}
              extra={viewTools}
            />
          </div>
          <div className="flex min-h-0 flex-1">
            {!isPost && <Outline editor={editor} collapsed={outlineOff} onToggle={toggleOutline} />}
            <div className="min-h-0 flex-1 overflow-y-auto p-6" data-editor-scroll>
              <div className={cn("mx-auto w-full", width === "wide" ? "max-w-6xl" : "max-w-3xl")} style={{ "--rich-size": `${TEXT_SIZES[isPost ? DEFAULT_SIZE_INDEX : sizeIdx]}rem` } as React.CSSProperties}>
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <RichEditor large bare readOnly={draft.status === "scheduled"} docKey={docKey} kind={draft.kind} doc={draft.doc} onChange={onDoc} onEditor={setEditor} onLinkRequest={() => setLinkOpen(true)} />
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-background px-4 py-1.5 text-xs text-muted-foreground" aria-label="Counts">
            {isPost
              ? <Badge variant={ser.overLimit ? "warn" : "outline"}>LinkedIn {ser.length.toLocaleString()}/{LINKEDIN_LIMIT.toLocaleString()}</Badge>
              : <span>{words.toLocaleString()} words · {readingMinutes(words)} min read · {ser.length.toLocaleString()} characters</span>}
            {isPost && draft.hashtags.length > 0 && <Badge variant="outline">{draft.hashtags.map((h) => `#${h}`).join(" ")}</Badge>}
            {ser.warnings.map((w) => <span key={w.code} className="text-[11px] text-amber-700 dark:text-amber-400">{w.message}</span>)}
            <span className="flex-1" />
            <SaveBadge state={store.saveState} retry={store.retry} />
          </div>
        </div>,
        host,
      )}
    </>
  );
}

function ViewTool({ label, on, disabled, onClick, children }: { label: string; on?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" title={label} aria-label={label} aria-pressed={on} disabled={disabled}
      className={cn(on && "bg-accent text-brand")} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>{children}</Button>
  );
}

function SaveBadge({ state, retry }: { state: DraftStore["saveState"]; retry: () => void }) {
  if (state === "error") {
    return <button type="button" className="cursor-pointer text-xs text-destructive underline" onClick={retry}>Not saved – retry</button>;
  }
  return <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" role="status">{state === "saving" ? "Saving…" : "Saved"}</span>;
}
