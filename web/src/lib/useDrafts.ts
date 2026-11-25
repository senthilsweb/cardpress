import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { flattenForPost, EMPTY_DOC, type Draft, type DraftInput, type DraftKind } from "./draft";
import { toCardDesign } from "./cardDesign";
import type { Design } from "./types";

export type SaveState = "saved" | "saving" | "error";
type Patch = Partial<Omit<DraftInput, "profileId">>;

const toInput = (d: Draft): DraftInput => ({
  profileId: d.profileId, kind: d.kind, doc: d.doc, hashtags: d.hashtags, altText: d.altText, unicodeStyles: d.unicodeStyles,
  title: d.title ?? "", ...(d.design ? { design: toCardDesign(d.design) } : {}),
});

/** What the server decides about a draft (its approval and planned date), as opposed to what the person writes. */
const meta = (x: Draft, s: Draft): Draft => ({ ...x, status: s.status, approvedAt: s.approvedAt, scheduledAt: s.scheduledAt, timezone: s.timezone, slug: s.slug, summary: s.summary, pageAt: s.pageAt, hasCover: s.hasCover, attachment: s.attachment, attachmentTitle: s.attachmentTitle, images: s.images, updatedAt: s.updatedAt });

/**
 * The profile's drafts and the one being edited. Changes show at once and are saved after a short pause;
 * switching, creating or deleting a draft saves any pending change first.
 */
export function useDrafts(profileId: string, initial: Draft[], designFor?: () => Design | undefined) {
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [currentId, setCurrentId] = useState(initial[0]?.id ?? "");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [rev, setRev] = useState(0); // changes when the text is replaced from outside (a restore), so the editor loads it
  const ref = useRef(drafts);
  const idRef = useRef(currentId);
  const dirty = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  ref.current = drafts;
  idRef.current = currentId;

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const id = dirty.current;
    const d = id ? ref.current.find((x) => x.id === id) : undefined;
    if (!d) { dirty.current = null; return; }
    dirty.current = null;
    setSaveState("saving");
    try {
      const saved = await api.updateDraft(d.id, toInput(d));
      // an edit made while this was saving will be saved next, and will say what the server should now know
      if (!dirty.current) commit(ref.current.map((x) => (x.id === saved.id ? meta(x, saved) : x)));
      setSaveState(dirty.current ? "saving" : "saved");
    } catch {
      dirty.current = dirty.current ?? d.id; // keep it pending so the next change retries
      setSaveState("error");
    }
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (next: Draft[]) => { ref.current = next; setDrafts(next); };

  const update = useCallback((patch: Patch) => {
    const id = idRef.current;
    // a draft waiting to be sent is not edited (the server refuses it too); a changed approved draft goes back to draft
    if (ref.current.find((d) => d.id === id)?.status === "scheduled") return;
    commit(ref.current.map((d) => (d.id === id
      ? { ...d, ...patch, ...(d.status === "approved" || d.status === "published" ? { status: "draft" as const, approvedAt: undefined, scheduledAt: undefined, timezone: undefined, pageAt: undefined, hasCover: false } : {}), updatedAt: new Date().toISOString() }
      : d)));
    dirty.current = id;
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  }, [flush]);

  const select = useCallback(async (id: string) => { await flush(); setCurrentId(id); }, [flush]);

  const create = useCallback(async (kind: DraftKind = "post") => {
    await flush();
    const design = designFor?.();
    const d = await api.createDraft({ profileId, kind, doc: EMPTY_DOC, hashtags: [], altText: "", unicodeStyles: false, ...(design ? { design: toCardDesign(design) } : {}) });
    commit([d, ...ref.current]);
    setCurrentId(d.id);
  }, [flush, profileId]);

  /**
   * Create a draft that already has content and switch to it. The editing target is switched at once (not after the next
   * render), so a change made straight afterwards cannot land in the draft that was open before.
   */
  const createFrom = useCallback(async (content: Pick<DraftInput, "kind" | "doc" | "hashtags" | "altText">): Promise<string> => {
    await flush();
    const design = designFor?.();
    const d = await api.createDraft({ profileId, unicodeStyles: false, ...(design ? { design: toCardDesign(design) } : {}), ...content });
    commit([d, ...ref.current]);
    idRef.current = d.id;
    setCurrentId(d.id);
    return d.id;
  }, [flush, profileId]);

  const remove = useCallback(async (id: string) => {
    await flush();
    await api.deleteDraft(id);
    const rest = ref.current.filter((d) => d.id !== id);
    commit(rest);
    if (rest.length) { if (idRef.current === id) setCurrentId(rest[0].id); }
    else await create("post");
  }, [flush, create]);

  /** Post documents only allow paragraphs, lists, bold and italic, so switching to a post simplifies an article. */
  const setKind = useCallback((kind: DraftKind) => {
    const cur = ref.current.find((d) => d.id === idRef.current);
    if (!cur || cur.kind === kind) return;
    update({ kind, doc: kind === "post" ? flattenForPost(cur.doc) : cur.doc });
  }, [update]);

  /** Approve, take back, or plan the open draft. Any pending change is saved first, so what is approved is what is shown. */
  const decide = useCallback(async (fn: (id: string) => Promise<Draft>) => {
    await flush();
    const id = idRef.current;
    const saved = await fn(id);
    commit(ref.current.map((x) => (x.id === saved.id ? meta(x, saved) : x)));
  }, [flush]);
  const approve = useCallback(() => decide((id) => api.approveDraft(id)), [decide]);
  const unapprove = useCallback(() => decide((id) => api.unapproveDraft(id)), [decide]);
  /** Put the open draft's page on the public web (or update it), with the card as its preview image. */
  const publishPage = useCallback((m: { slug?: string; summary?: string }, cover?: Blob) => decide((id) => api.publishPage(id, m, cover)), [decide]);
  const unpublishPage = useCallback(() => decide((id) => api.unpublishPage(id)), [decide]);
  /** Give the open post a picture of its own in place of the card, or go back to the card. */
  const setAttachment = useCallback((file: Blob, name = "") => decide((id) => api.setAttachment(id, file, name)), [decide]);
  const setAttachmentTitle = useCallback((title: string) => decide((id) => api.setAttachmentTitle(id, title)), [decide]);
  const addImage = useCallback((file: Blob) => decide((id) => api.addImage(id, file)), [decide]);
  const setImageAlt = useCallback((imageId: string, alt: string) => decide((id) => api.setImageAlt(id, imageId, alt)), [decide]);
  const orderImages = useCallback((ids: string[]) => decide((id) => api.orderImages(id, ids)), [decide]);
  const removeImage = useCallback((imageId: string) => decide((id) => api.removeImage(id, imageId)), [decide]);
  const clearAttachment = useCallback(() => decide((id) => api.clearAttachment(id)), [decide]);
  const plan = useCallback((p: { scheduledAt?: string; timezone?: string }) => decide((id) => api.planDraft(id, p)), [decide]);
  /** Re-read the open draft's status: a post sent from it changes it behind the screen. */
  const refreshStatus = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    try { const saved = await api.getDraft(id); commit(ref.current.map((x) => (x.id === saved.id && dirty.current !== x.id ? meta(x, saved) : x))); } catch { /* the next look will do */ }
  }, []);

  /** Put an old version back as the open draft's text. */
  const restoreVersion = useCallback(async (seq: number) => {
    await flush();
    const id = idRef.current;
    const d = await api.restoreVersion(id, seq);
    commit(ref.current.map((x) => (x.id === d.id ? d : x)));
    setRev((r) => r + 1);
  }, [flush]);

  const current = drafts.find((d) => d.id === currentId) ?? drafts[0];
  return { drafts, current, rev, restoreVersion, saveState, update, select, create, createFrom, remove, setKind, retry: flush, approve, unapprove, plan, publishPage, unpublishPage, refreshStatus, setAttachment, setAttachmentTitle, clearAttachment, addImage, setImageAlt, orderImages, removeImage };
}

export type DraftStore = ReturnType<typeof useDrafts>;
