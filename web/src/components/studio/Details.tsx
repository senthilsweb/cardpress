import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, Copy, Eye, FileText, Film, ImageUp, Loader2, Maximize2, Minimize2, Send, Trash2, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Section } from "./fields";
import { FormField } from "./FormField";
import { BlurField } from "./BlurField";
import { Versions } from "./Versions";
import { blockerLine, blockers, maxOf, type FieldName } from "@/lib/details";
import { EditorToolbar, Outline, RichEditor } from "./RichEditor";
import { FullPreview, linkedinSize } from "./FullPreview";
import { PublishBar } from "./PublishBar";
import { ArticleBar } from "./ArticleBar";
import { PageBar } from "./PageBar";
import { JobQueue } from "./JobQueue";
import type { JobsStore } from "@/lib/useJobs";
import { copyFormatted } from "@/lib/clipboard";
import { sectionOpen, useLayout } from "@/lib/layout";
import { lockReason } from "@/lib/lock";
import { labelCache, labelOf, shortLabel } from "@/lib/draftLabel";
import { useSession } from "@/lib/session";
import { normalizeHashtag, type Draft, type DocNode, type DraftKind } from "@/lib/draft";
import { countWords, DEFAULT_SIZE_INDEX, parseSizeIndex, parseWidth, readingMinutes, stepSize, TEXT_SIZES, type TextWidth } from "@/lib/editorTools";
import { LINKEDIN_LIMIT, serializeDraft, serializeForLinkedIn } from "@/lib/linkedin";
import { CAPTION_LIMITS, NETWORKS, type Size } from "@/lib/sizes";
import { formatInZone, type Job } from "@/lib/jobs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { leftOut, whyNot } from "@/lib/media";
import type { PostMediaView } from "@/lib/usePostMedia";
import { flushPendingEdits } from "@/lib/pendingEdits";
import { cn } from "@/lib/utils";
import type { DraftStore } from "@/lib/useDrafts";
import type { Design, Palette, Profile } from "@/lib/types";

const STATUS_NAME = { draft: "Draft", approved: "Approved", scheduled: "Scheduled", published: "Published" } as const;
const MAX_IMAGE_BYTES = 10 << 20; // the server refuses more
const MAX_DOCUMENT_BYTES = 20 << 20;
const MAX_POST_IMAGES = 10;

/** A saved view choice. Storage can be blocked or full, and the choice is only a convenience. */
const loadPref = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const savePref = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* not remembered */ } };

/**
 * Everything about the item on screen, each field once, in the groups of the content schema. Its status, what is
 * missing and the next step stay at the bottom.
 */
export function Details({ media, changed, onSeen, setCard, onCardFocus, versionsAsked, openPreview, onPreviewOpened, store, jobs, brandNames, renderPng, onOpenSettings, design, profile, palette, size, expanded, setExpanded, host }: {
  /** What the open post carries. */
  media: PostMediaView;
  /** Fields someone else changed that have not been looked at. */
  changed: readonly FieldName[];
  onSeen: (name: FieldName) => void;
  /** Change the card (its words are fields here). */
  setCard: (patch: Partial<Design>) => void;
  /** Whether the person is working on the card's words, so the card should be on the canvas. */
  onCardFocus: (on: boolean) => void;
  /** Counts up each time the versions are asked for. */
  versionsAsked: number;
  /** Open the Full preview as soon as this shows (asked for by the library). */
  openPreview?: boolean;
  /** Called once it has opened, so it does not open again the next time this shows. */
  onPreviewOpened?: () => void;
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
  const { current: draft } = store;
  const { can } = useSession();
  const { editorHeight, setEditorHeight, isCollapsed, toggle } = useLayout();
  const recordOpen = sectionOpen(isCollapsed("record"), true);
  const record = useRef<HTMLDivElement>(null);
  const asked = useRef(0);
  useEffect(() => {
    if (versionsAsked === asked.current) return;
    asked.current = versionsAsked;
    if (!versionsAsked) return;
    if (!recordOpen) toggle("record");
    window.setTimeout(() => record.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 220);
  }, [versionsAsked]); // eslint-disable-line react-hooks/exhaustive-deps
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { if (!confirmDelete) return; const t = window.setTimeout(() => setConfirmDelete(false), 4000); return () => window.clearTimeout(t); }, [confirmDelete]);
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
  useEffect(() => { if (openPreview) { flushPendingEdits(); setPreview(true); onPreviewOpened?.(); } }, [openPreview]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tag, setTag] = useState("");
  const own = draft?.kind === "post" && media.media.kind !== "card" ? media.media.kind : undefined;
  const pics = own === "images" ? draft?.images ?? [] : [];
  const { picUrls, file: ownSrc } = media;
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const flash = (m: string) => { setNote(m); window.setTimeout(() => setNote(null), 2200); };
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

  // the video's address, as typed; the field is open for a new video or a change of address
  const [video, setVideo] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { setVideo(null); setConfirmDelete(false); }, [draft?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const ser = useMemo(() => {
    if (!draft) return null;
    const out = serializeDraft(draft);
    labelCache.set(draft.doc, shortLabel(out.text)); // the picker needs the same text, so it is not worked out twice
    return out;
  }, [draft]);
  const words = useMemo(() => (ser ? countWords(ser.text) : 0), [ser]);
  // what the server is sent: the text without the hashtag line, which it turns into real hashtags itself
  const bodyOnly = useMemo(() => (draft && draft.kind === "post" ? serializeForLinkedIn(draft.doc, { unicodeStyles: draft.unicodeStyles }).text : ""), [draft]);
  if (!draft || !ser) return null;
  const isPost = draft.kind === "post";

  // approving is the step between writing and publishing: only an approved draft can be sent
  const approve = guard(async () => { await store.approve(); toast.success("Approved", { description: isPost ? "It can now be published or scheduled." : "It is marked final." }); });
  const unapprove = guard(async () => { await store.unapprove(); toast("Back to draft"); });

  const locked = !!lockReason(draft); // waiting to be sent, or published: it cannot change
  const d = draft;
  const kind = d.kind;
  const stop = blockers(d, { value: ser.text, length: ser.length, limit: isPost ? LINKEDIN_LIMIT : undefined });
  const stopped = blockerLine(stop);
  const card = (key: "eyebrow" | "title" | "subtitle" | "tag" | "footer" | "footerLeft" | "quoteAuthor" | "statValue") => (design[key] ?? "") as string;
  const field = (name: FieldName) => ({ name, kind, changed: changed.includes(name), onSeen });
  const L = design.layout;
  /** The card's words, with the ones this layout does not draw said so. */
  const words_ = [
    { name: "tag", key: "tag", shown: L === "cover" },
    { name: "eyebrow", key: "eyebrow", shown: L !== "quote" },
    { name: "statValue", key: "statValue", shown: L === "stat" },
    { name: "headline", key: "title", shown: true, label: L === "quote" ? "Quote" : L === "stat" ? "What the number means" : undefined, lines: L === "quote" ? 4 : 2, hint: "Enter starts a new line." },
    { name: "subtitle", key: "subtitle", shown: L !== "quote", hint: "Use | to split into points." },
    { name: "quoteAuthor", key: "quoteAuthor", shown: L === "quote" },
    { name: "footerLeft", key: "footerLeft", shown: true, placeholder: "Your website" },
    { name: "footer", key: "footer", shown: true, placeholder: "Your handle" },
  ] as const;
  // a field this layout does not draw is listed after the ones it does
  const cardWords = [...words_.filter((w) => w.shown), ...words_.filter((w) => !w.shown)];
  const plan = (key: "audience" | "topic" | "campaign" | "reviewNotes") => async (v: string) => {
    try { await store.setPlanning(d.id, { [key]: v }); } catch (e) { toast.error("Not saved", { description: (e as Error).message }); throw e; }
  };
  const page = (key: "slug" | "summary") => async (v: string) => {
    try { await store.setPageFields(d.id, { [key]: v }); } catch (e) { toast.error("Not saved", { description: (e as Error).message }); throw e; }
  };
  const pickFile = guard(async () => {
    const files = Array.from(fileRef.current?.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    const pdfs = files.filter(isPdf), images = files.filter((f) => !isPdf(f));
    if (pdfs.length && (pdfs.length > 1 || images.length)) throw new Error("Choose one PDF, or images, not both.");
    if (pdfs.length) {
      if (pdfs[0].size > MAX_DOCUMENT_BYTES) throw new Error("The PDF is over 20 MB.");
      await store.setAttachment(pdfs[0], pdfs[0].name);
      toast.success("Your PDF replaces the card", { description: "Approve the post again before publishing." });
      return;
    }
    if (images.some((f) => f.size > MAX_IMAGE_BYTES)) throw new Error("An image is over 10 MB.");
    // one image on its own stays a single image; more, or adding to a set, makes a set
    if (images.length === 1 && own !== "images") {
      await store.setAttachment(images[0], images[0].name);
      toast.success("Your image replaces the card", { description: "Approve the post again before publishing." });
      return;
    }
    if (pics.length + images.length > MAX_POST_IMAGES) throw new Error(`A post can carry at most ${MAX_POST_IMAGES} images.`);
    for (const f of images) await store.addImage(f); // one after another, so they keep the order they were chosen in
    toast.success(`${pics.length + images.length} images replace the card`, { description: "Approve the post again before publishing." });
  });
  const movePic = (i: number, by: 1 | -1) => guard(async () => {
    const ids = pics.map((p) => p.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    await store.orderImages(ids);
  })();
  const removePic = (id: string) => guard(async () => { await store.removeImage(id); })();
  const savePicAlt = (id: string, alt: string) => guard(async () => { await store.setImageAlt(id, alt); })();
  const saveTitle = (title: string) => guard(async () => { await store.setAttachmentTitle(title); })();
  const useCard = guard(async () => { await store.clearAttachment(); toast("The card goes out with this post"); });

  const saveVideo = guard(async () => {
    const url = (video ?? "").trim();
    if (!url || checking) return;
    setChecking(true);
    try {
      await store.setVideo(url);
      setVideo(null);
      toast.success("Your video replaces the card", { description: "Approve the post again before publishing." });
    } catch (e) {
      toast.error("The video cannot be used", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setChecking(false);
    }
  });

  const addTag = () => {
    const t = normalizeHashtag(tag);
    setTag("");
    if (t && !draft.hashtags.some((h) => h.toLowerCase() === t.toLowerCase())) store.update({ hashtags: [...draft.hashtags, t] });
  };
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
    <div className="flex h-full min-h-0 flex-col" aria-label="Details">
      <div className="min-h-0 flex-1 overflow-y-auto" onFocusCapture={(e) => onCardFocus(!!(e.target as Element).closest("[data-card-words]"))}>
      <Section
        id="writing" title="Writing"
        action={
          <div className="flex items-center gap-2">
            <SaveBadge state={store.saveState} retry={store.retry} />
            <Button variant="ghost" size="icon-sm" title="Expand the editor over the studio" aria-label="Expand the editor" onClick={() => { flushPendingEdits(); setExpanded(true); }}><Maximize2 /></Button>
          </div>
        }
      >
        <FormField {...field("kind")} hint={isPost ? "A post is sent to LinkedIn with the card image." : "An article is copied with its formatting into LinkedIn's article editor or a blog."}>
          <ToggleGroup type="single" disabled={locked} value={draft.kind} onValueChange={(v) => { if (v) { flushPendingEdits(); store.setKind(v as DraftKind); } }}>
            <ToggleGroupItem value="post">Post</ToggleGroupItem>
            <ToggleGroupItem value="article"><FileText className="mr-1 h-3.5 w-3.5" /> Article</ToggleGroupItem>
          </ToggleGroup>
        </FormField>
        <FormField {...field("title")} value={draft.title} htmlFor="d-title" hint={isPost ? "Names it in the library." : undefined}>
          <Input id="d-title" value={draft.title} maxLength={maxOf("title", kind)} onChange={(e) => store.update({ title: e.target.value })} disabled={locked} />
        </FormField>
        <FormField {...field("body")} value={ser.text}>
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
            <RichEditor fill readOnly={!!lockReason(draft)} docKey={docKey} kind={draft.kind} doc={draft.doc} onChange={onDoc} onEditor={setEditor} />
          </div>
        )}
        {isPost && (
          <div className="flex flex-wrap gap-1.5" aria-label="Character counts">
            {NETWORKS.filter((net) => !whyNot(net, media.media)).map((net) => (
              <Badge key={net} variant={ser.length > CAPTION_LIMITS[net] ? "warn" : "outline"}>{net} {ser.length}/{CAPTION_LIMITS[net].toLocaleString()}</Badge>
            ))}
          </div>
        )}
        {ser.warnings.map((w) => <p key={w.code} className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">{w.message}</p>)}
        </FormField>
        {!isPost && (
          <div inert={locked} className={locked ? "opacity-60" : undefined}>
            <FormField {...field("summary")} value={draft.summary ?? ""} htmlFor="d-summary">
              <BlurField key={draft.id} id="d-summary" lines rows={3} value={draft.summary ?? ""} maxLength={maxOf("summary", kind)} onSave={page("summary")} disabled={locked} placeholder="The first paragraph, if left empty" />
            </FormField>
          </div>
        )}
      </Section>

      <div data-card-words>
        <Section id="card-words" title="Card words">
          <div inert={locked} className={cn("space-y-3", locked && "opacity-60")}>
            {cardWords.map((w) => (
              <FormField key={w.name} {...field(w.name)} label={"label" in w ? w.label : undefined} value={card(w.key)} htmlFor={`d-${w.name}`}
                hint={!w.shown ? "Not drawn by this layout." : "hint" in w ? w.hint : undefined}>
                {"lines" in w
                  ? <Textarea id={`d-${w.name}`} rows={w.lines} value={card(w.key)} maxLength={maxOf(w.name, kind)} onChange={(e) => setCard({ [w.key]: e.target.value })} />
                  : <Input id={`d-${w.name}`} value={card(w.key)} maxLength={maxOf(w.name, kind)} placeholder={"placeholder" in w ? w.placeholder : undefined} onChange={(e) => setCard({ [w.key]: e.target.value })} />}
              </FormField>
            ))}
          </div>
        </Section>
      </div>

      <Section id="sharing" title="Sharing">
        <div inert={locked} className={cn("space-y-3", locked && "opacity-60")}>
          {isPost && (
            <FormField {...field("hashtags")} value={draft.hashtags} hint="Added as the last line.">
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
            </FormField>
          )}
          {isPost && (
            <FormField {...field("attachment")}>
            <div className="space-y-2" aria-label="Attachment">
              <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,application/pdf" className="hidden" onChange={() => void pickFile()} aria-label="Choose images or a PDF" />
              {own === "images" ? (
                <>
                  <p className="text-xs text-muted-foreground">{pics.length === 1 ? "Your image goes out, not the card." : `Your ${pics.length} images go out, not the card.`}</p>
                  <ol className="space-y-1.5" aria-label="Images, in order">
                    {pics.map((p, i) => (
                      <li key={p.id} className="flex items-center gap-2">
                        {picUrls[p.id] ? <img src={picUrls[p.id]} alt="" className="h-11 w-14 shrink-0 rounded border border-border object-cover" /> : <div className="h-11 w-14 shrink-0 rounded border border-border bg-muted" aria-hidden />}
                        <Input key={`${p.id}:${p.altText}`} defaultValue={p.altText} placeholder={`Alt text for image ${i + 1}`} aria-label={`Alt text for image ${i + 1}`} disabled={locked} className="h-8 min-w-0 flex-1 text-xs"
                          onBlur={(e) => { if (e.target.value.trim() !== p.altText) void savePicAlt(p.id, e.target.value); }}
                          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                        <Button variant="ghost" size="icon-sm" disabled={locked || i === 0} onClick={() => void movePic(i, -1)} aria-label={`Move image ${i + 1} up`}><ArrowUp /></Button>
                        <Button variant="ghost" size="icon-sm" disabled={locked || i === pics.length - 1} onClick={() => void movePic(i, 1)} aria-label={`Move image ${i + 1} down`}><ArrowDown /></Button>
                        <Button variant="ghost" size="icon-sm" disabled={locked} onClick={() => void removePic(p.id)} aria-label={`Remove image ${i + 1}`}><X /></Button>
                      </li>
                    ))}
                  </ol>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" disabled={locked || pics.length >= MAX_POST_IMAGES} onClick={() => fileRef.current?.click()}><ImageUp /> Add images</Button>
                    <Button variant="outline" size="sm" disabled={locked} onClick={useCard}>Use the card</Button>
                  </div>
                </>
              ) : own === "video" ? (
                <div className="flex items-center gap-2.5">
                  <div className="grid h-14 w-24 shrink-0 place-items-center rounded border border-border bg-muted text-muted-foreground" aria-hidden><Film className="h-6 w-6" /></div>
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-xs text-muted-foreground">Your video goes out, not the card.</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground" title={draft.videoUrl}>{Math.max(0.1, (draft.videoSize ?? 0) / 1048576).toFixed(1)} MB · {draft.videoUrl}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" disabled={locked} onClick={() => setVideo(draft.videoUrl ?? "")}><Film /> Change</Button>
                      <Button variant="outline" size="sm" disabled={locked} onClick={useCard}>Use the card</Button>
                    </div>
                  </div>
                </div>
              ) : own ? (
                <div className="flex items-center gap-2.5">
                  {own === "document"
                    ? <div className="grid h-14 w-24 shrink-0 place-items-center rounded border border-border bg-muted text-muted-foreground" aria-hidden><FileText className="h-6 w-6" /></div>
                    : ownSrc ? <img src={ownSrc} alt="" className="h-14 w-24 shrink-0 rounded border border-border object-cover" /> : <div className="h-14 w-24 shrink-0 rounded border border-border bg-muted" aria-hidden />}
                  <div className="min-w-0 space-y-1.5">
                    <p className="text-xs text-muted-foreground">{own === "document" ? "Your PDF goes out, not the card." : "Your image goes out, not the card."}</p>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="outline" size="sm" disabled={locked} onClick={() => fileRef.current?.click()}><ImageUp /> Change</Button>
                      <Button variant="outline" size="sm" disabled={locked} onClick={useCard}>Use the card</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-full text-xs text-muted-foreground">The card goes out with the post.</span>
                  <Button variant="outline" size="sm" disabled={locked} onClick={() => fileRef.current?.click()}><ImageUp /> Use images or a PDF</Button>
                  <Button variant="outline" size="sm" disabled={locked || video !== null} onClick={() => setVideo("")}><Film /> Use a video</Button>
                </div>
              )}
              {video !== null && !locked && (
                <form className="flex flex-wrap items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); void saveVideo(); }}>
                  <Input autoFocus type="url" value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://…/video.mp4" aria-label="Video address" disabled={checking} className="h-8 min-w-0 flex-1 text-xs" />
                  <Button type="submit" variant="brand" size="sm" disabled={checking || !video.trim()}>{checking ? <Loader2 className="animate-spin" /> : <Check />} Add</Button>
                  <Button type="button" variant="ghost" size="icon-sm" disabled={checking} onClick={() => setVideo(null)} aria-label="Cancel"><X /></Button>
                  <p className="w-full text-[11px] text-muted-foreground">A direct link to a public MP4. It is not uploaded or stored here.</p>
                </form>
              )}
            </div>
            {leftOut(media.media).length > 0 && (
              <p className="text-[11px] leading-snug text-muted-foreground" aria-label="Networks left out">Not for {leftOut(media.media).map((l) => `${l.net} (${l.why})`).join(", ")}.</p>
            )}
            {leftOut(media.media).length > 0 && (
              <p className="text-[11px] leading-snug text-muted-foreground" aria-label="Networks left out">Not for {leftOut(media.media).map((l) => `${l.net} (${l.why})`).join(", ")}.</p>
            )}
            </FormField>
          )}
          {isPost && (own === "document" || own === "video") ? (
              <FormField {...field("attachment")} label={own === "video" ? "Video title" : "Document title"} hint={own === "video" ? "Shown with the video on LinkedIn." : "Shown above the pages on LinkedIn."}>
                <Input key={`${draft.id}:${draft.attachmentTitle}`} defaultValue={draft.attachmentTitle ?? ""} maxLength={150} disabled={locked} aria-label={own === "video" ? "Video title" : "Document title"}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== draft.attachmentTitle) void saveTitle(v); else e.target.value = draft.attachmentTitle ?? ""; }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
              </FormField>
          ) : own === "images" ? null : (
            <FormField {...field("altText")} value={draft.altText} htmlFor="d-alt" hint="For screen readers.">
              <Textarea id="d-alt" rows={2} value={draft.altText} maxLength={maxOf("altText", kind)} onChange={(e) => store.update({ altText: e.target.value })} />
            </FormField>
          )}
          {isPost && (
            <FormField {...field("unicodeStyles")}>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={draft.unicodeStyles} onCheckedChange={(v) => store.update({ unicodeStyles: v })} />
                Keep bold and italic (Unicode)
              </label>
            </FormField>
          )}
          {!isPost && (
            <FormField {...field("slug")} value={draft.slug ?? ""} htmlFor="d-slug">
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">/articles/</span>
                <div className="min-w-0 flex-1">
                  <BlurField key={draft.id} id="d-slug" value={draft.slug ?? ""} maxLength={maxOf("slug", kind)} onSave={(v) => page("slug")(v.toLowerCase().replace(/\s+/g, "-"))} disabled={locked} placeholder="made from the title" />
                </div>
              </div>
            </FormField>
          )}
        </div>
      </Section>

      <Section id="planning" title="Planning">
        {(["audience", "topic", "campaign", "reviewNotes"] as const).map((name) => {
          const notes = name === "reviewNotes", mine = !notes || can("approve");
          return (
            <FormField key={name} {...field(name)} value={draft[name] ?? ""} htmlFor={`d-${name}`} hint={notes ? (mine ? "Never published." : "Written by an editor or admin.") : undefined}>
              <BlurField key={draft.id} id={`d-${name}`} lines={notes} rows={3} value={draft[name] ?? ""} maxLength={maxOf(name, kind)} onSave={plan(name)} disabled={!mine} />
            </FormField>
          );
        })}
      </Section>

      <Section id="queue" title="Publishing queue" folded>
        <JobQueue store={jobs} brands={brandNames} />
      </Section>

      <div ref={record}>
        <Section id="record" title="Record and versions" folded>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
            <dt className="text-muted-foreground">Created</dt><dd>{formatInZone(draft.createdAt)}{draft.createdByName ? ` · ${draft.createdByName}` : ""}</dd>
            {draft.approvedAt && <><dt className="text-muted-foreground">Approved</dt><dd>{formatInZone(draft.approvedAt)}{draft.approvedByName ? ` · ${draft.approvedByName}` : ""}</dd></>}
            {draft.scheduledAt && <><dt className="text-muted-foreground">Planned for</dt><dd>{formatInZone(draft.scheduledAt, draft.timezone)}</dd></>}
            {draft.pageAt && <><dt className="text-muted-foreground">Page live</dt><dd>{formatInZone(draft.pageAt)}</dd></>}
          </dl>
          <Versions open={recordOpen} draft={draft} statusKey={`${draft.id}:${draft.status}:${draft.version}`} onRestore={async (seq) => { flushPendingEdits(); await store.restoreVersion(seq); }} />
          <Button variant={confirmDelete ? "destructive" : "outline"} size="sm" disabled={draft.status !== "draft"}
            title={draft.status === "draft" ? undefined : "Bring it back to draft to delete it"}
            onClick={() => { if (!confirmDelete) setConfirmDelete(true); else { setConfirmDelete(false); void guard(() => store.remove(draft.id))(); } }}>
            <Trash2 /> {confirmDelete ? "Confirm delete" : `Delete this ${draft.kind}`}
          </Button>
        </Section>
      </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-border bg-card px-4 py-3" aria-label="Status">
        <div className="flex flex-wrap items-center gap-2" aria-label="Approval">
          <Badge variant={draft.status === "draft" ? "outline" : "brand"}>{STATUS_NAME[draft.status]}</Badge>
          {draft.pageAt && <Badge variant="brand" title="This has a public page">Page live</Badge>}
          <span role="status" className={cn("min-w-0 flex-1 text-[11px] leading-snug", stop.over.length ? "text-destructive" : "text-muted-foreground")}>
            {lockReason(draft) ?? (draft.status === "draft" ? stopped || (can("approve") ? "Ready to approve" : "An editor or admin approves it.") : note)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="icon-sm" title="Full preview" aria-label="Full preview" onClick={openFull}><Eye /></Button>
          <Button variant="ghost" size="icon-sm" title={isPost ? "Copy text" : "Copy formatted"} aria-label={isPost ? "Copy text" : "Copy formatted"} onClick={copyNow} disabled={!ser.text.trim()}><Copy /></Button>
          {note && draft.status === "draft" && <span className="text-xs text-brand">{note}</span>}
          <span className="flex-1" />
          {draft.status === "approved" && <Button variant="outline" size="sm" onClick={unapprove}><Undo2 /> Back to draft</Button>}
          {draft.status === "draft" && can("approve") && <Button variant="brand" size="sm" onClick={approve} disabled={!!stopped}><Check /> Approve</Button>}
          {draft.status === "approved" && can("publish") && <Button variant="brand" size="sm" onClick={openFull}><Send /> Publish</Button>}
          {(draft.status === "published" || (draft.pageAt && draft.status !== "approved")) && <Button variant="brand" size="sm" onClick={unapprove}><Undo2 /> Back to draft</Button>}
        </div>
      </div>

      <FullPreview
        media={media.frame}
        open={preview} onOpenChange={setPreview} draft={draft} serialized={ser}
        articleHtml={preview ? html() : ""} design={design} profile={profile} palette={palette} size={size}
        actions={(
          <div className="space-y-3">
            {draft.kind === "article" ? (
              <ArticleBar draft={draft} html={html} onApprove={approve} onPlan={store.plan} />
            ) : (
              <PublishBar
                own={own}
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
            <span className="truncate text-xs text-muted-foreground">{labelOf(draft)}</span>
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
                  <RichEditor large bare readOnly={!!lockReason(draft)} docKey={docKey} kind={draft.kind} doc={draft.doc} onChange={onDoc} onEditor={setEditor} onLinkRequest={() => setLinkOpen(true)} />
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
    </div>
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
