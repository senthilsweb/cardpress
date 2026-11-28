import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { merge, note, union, untouched, type Touched } from "./merge";
import { flushPendingEdits } from "./pendingEdits";
import { lockReason } from "./lock";
import { flattenForPost, EMPTY_DOC, type Draft, type DraftInput, type DraftKind } from "./draft";
import { blankCard, isBlank } from "./fresh";
import { toCardDesign } from "./cardDesign";
import type { Design } from "./types";

export type SaveState = "saved" | "saving" | "error";
type Patch = Partial<Omit<DraftInput, "profileId">>;

const toInput = (d: Draft): DraftInput => ({
  profileId: d.profileId, kind: d.kind, doc: d.doc, hashtags: d.hashtags, altText: d.altText, unicodeStyles: d.unicodeStyles,
  title: d.title ?? "", ...(d.design ? { design: toCardDesign(d.design) } : {}),
});

/** What the server decides about a draft (its approval and planned date), as opposed to what the person writes. */
const meta = (x: Draft, s: Draft): Draft => ({ ...x, revision: s.revision, version: s.version, versionIsCurrent: s.versionIsCurrent, status: s.status, approvedAt: s.approvedAt, scheduledAt: s.scheduledAt, timezone: s.timezone, slug: s.slug, summary: s.summary, pageAt: s.pageAt, hasCover: s.hasCover, attachment: s.attachment, attachmentTitle: s.attachmentTitle, images: s.images, videoUrl: s.videoUrl, videoSize: s.videoSize, attachmentSize: s.attachmentSize, audience: s.audience, topic: s.topic, campaign: s.campaign, reviewNotes: s.reviewNotes, updatedAt: s.updatedAt });

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
  const edits = useRef(new Map<string, Touched>()); // changed and not yet sent
  const sending = useRef(new Map<string, Touched>()); // sent and not yet confirmed
  const saving = useRef<Promise<void>>(Promise.resolve()); // saves go one after another
  const unconfirmed = (id: string) => union(sending.current.get(id) ?? untouched(), edits.current.get(id) ?? untouched());
  ref.current = drafts;
  idRef.current = currentId;

  /** Put a draft that came from the server in place, keeping what the person changed and has not saved. */
  const receive = (server: Draft) => {
    const local = ref.current.find((d) => d.id === server.id);
    if (!local) { commit([server, ...ref.current]); return; }
    if (server.revision < local.revision) return;
    const next = merge(server, local, unconfirmed(server.id));
    const replaced = JSON.stringify(next.doc) !== JSON.stringify(local.doc);
    commit(ref.current.map((d) => (d.id === server.id ? next : d)));
    if (replaced && server.id === idRef.current) setRev((r) => r + 1); // the editor loads the new text
  };

  const save = async () => {
    const id = dirty.current;
    const d = id ? ref.current.find((x) => x.id === id) : undefined;
    if (!id || !d) { dirty.current = null; return; }
    dirty.current = null;
    sending.current.set(id, edits.current.get(id) ?? untouched());
    edits.current.delete(id);
    setSaveState("saving");
    try {
      let saved: Draft;
      try {
        saved = await api.updateDraft(id, { ...toInput(d), revision: d.revision });
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== "stale") throw e;
        // someone else changed it (the assistant): lay this change over theirs and save again
        receive(await api.getDraft(id));
        const mine = ref.current.find((x) => x.id === id)!;
        saved = await api.updateDraft(id, { ...toInput(mine), revision: mine.revision });
      }
      sending.current.delete(id);
      // an edit made while this was saving will be saved next, and will say what the server should now know
      commit(ref.current.map((x) => (x.id !== saved.id ? x : dirty.current === saved.id ? { ...x, revision: saved.revision, version: saved.version, versionIsCurrent: saved.versionIsCurrent } : meta(x, saved))));
      setSaveState(dirty.current ? "saving" : "saved");
    } catch {
      edits.current.set(id, unconfirmed(id));
      sending.current.delete(id);
      dirty.current = dirty.current ?? id; // keep it pending so the next change retries
      setSaveState("error");
    }
  };

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    saving.current = saving.current.then(save);
    return saving.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // changes made elsewhere (the assistant, another tab) arrive as they happen
  useEffect(() => {
    const stop = new AbortController();
    const look = async (id: string, revision?: number) => {
      const local = ref.current.find((d) => d.id === id);
      if (local && revision !== undefined && revision <= local.revision) return;
      const server = await api.getDraft(id, true);
      if (stop.signal.aborted || server.profileId !== profileId) return;
      flushPendingEdits(); // what is being typed reaches the store first, so it is kept
      receive(server);
    };
    const catchUp = async () => {
      for (const d of await api.listDrafts(profileId, true)) {
        const local = ref.current.find((x) => x.id === d.id);
        if (!local || d.revision > local.revision) await look(d.id);
      }
    };
    void (async () => {
      let wait = 1000;
      while (!stop.signal.aborted) {
        try {
          await api.listen(profileId, (e) => { if (e.type === "draft") void look(e.draftId, e.revision).catch(() => undefined); },
            () => { wait = 1000; void catchUp().catch(() => undefined); }, stop.signal);
        } catch { /* try again below */ }
        if (stop.signal.aborted) return;
        await new Promise((r) => window.setTimeout(r, wait));
        wait = Math.min(wait * 2, 30_000);
      }
    })();
    return () => stop.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Save what is waiting, and say where each item then stands. */
  const settled = useCallback(async () => {
    flushPendingEdits();
    await flush();
    return Object.fromEntries(ref.current.map((d) => [d.id, d.revision]));
  }, [flush]);

  /** Read items again after the server changed them on request (a reply saved or undone). */
  const reload = useCallback(async (ids: string[]) => {
    for (const id of ids) receive(await api.getDraft(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = (next: Draft[]) => { ref.current = next; setDrafts(next); };

  const update = useCallback((patch: Patch) => {
    const id = idRef.current;
    // a draft waiting to be sent is not edited (the server refuses it too); a changed approved draft goes back to draft
    const before = ref.current.find((d) => d.id === id);
    if (!before || lockReason(before)) return;
    edits.current.set(id, note(edits.current.get(id) ?? untouched(), before, patch as Record<string, unknown>));
    commit(ref.current.map((d) => (d.id === id
      ? { ...d, ...patch, ...(d.status === "approved" ? { status: "draft" as const, approvedAt: undefined, scheduledAt: undefined, timezone: undefined, pageAt: undefined, hasCover: false } : {}), updatedAt: new Date().toISOString() }
      : d)));
    dirty.current = id;
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  }, [flush]);

  const select = useCallback(async (id: string) => { await flush(); setCurrentId(id); }, [flush]);

  /** A new, empty item: the brand's look with nothing written on the card. */
  const create = useCallback(async (kind: DraftKind = "post") => {
    await flush();
    const base = designFor?.();
    const d = await api.createDraft({ profileId, kind, doc: EMPTY_DOC, hashtags: [], altText: "", unicodeStyles: false, ...(base ? { design: toCardDesign(blankCard(base)) } : {}) });
    commit([d, ...ref.current]);
    idRef.current = d.id;
    setCurrentId(d.id);
  }, [flush, profileId]);

  /** Show an empty item: an untouched one no conversation is using if there is one, else a new one. */
  const fresh = useCallback(async (kind: DraftKind = "post", used: (id: string) => boolean = () => false) => {
    await flush();
    const open = ref.current.find((d) => d.id === idRef.current);
    const spare = [open, ...ref.current].find((d) => d && d.kind === kind && isBlank(d) && !used(d.id));
    if (!spare) return create(kind);
    idRef.current = spare.id;
    setCurrentId(spare.id);
  }, [flush, create]);

  /**
   * Create a draft that already has content and, unless told not to, switch to it. The editing target is switched at once
   * (not after the next render), so a change made straight afterwards cannot land in the draft that was open before.
   */
  const createFrom = useCallback(async (content: Pick<DraftInput, "kind" | "doc" | "hashtags" | "altText"> & { title?: string; design?: Design }, opts: { select?: boolean } = {}): Promise<string> => {
    await flush();
    const design = content.design ?? designFor?.();
    const d = await api.createDraft({ profileId, unicodeStyles: false, ...content, ...(design ? { design: toCardDesign(design) } : {}) });
    commit([d, ...ref.current]);
    if (opts.select !== false) {
      idRef.current = d.id;
      setCurrentId(d.id);
    }
    return d.id;
  }, [flush, profileId]);

  /** Delete an item. If it was the one on screen, what follows is an empty one, not whichever came before it. */
  const remove = useCallback(async (id: string, used?: (id: string) => boolean) => {
    await flush();
    const gone = ref.current.find((d) => d.id === id);
    const wasOpen = idRef.current === id;
    await api.deleteDraft(id);
    commit(ref.current.filter((d) => d.id !== id));
    if (wasOpen || !ref.current.length) await fresh(gone?.kind ?? "post", used);
  }, [flush, fresh]);

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
  const setVideo = useCallback((url: string) => decide((id) => api.setVideo(id, url)), [decide]);
  const addImage = useCallback((file: Blob) => decide((id) => api.addImage(id, file)), [decide]);
  const setImageAlt = useCallback((imageId: string, alt: string) => decide((id) => api.setImageAlt(id, imageId, alt)), [decide]);
  const orderImages = useCallback((ids: string[]) => decide((id) => api.orderImages(id, ids)), [decide]);
  const removeImage = useCallback((imageId: string) => decide((id) => api.removeImage(id, imageId)), [decide]);
  const clearAttachment = useCallback(() => decide((id) => api.clearAttachment(id)), [decide]);
  const plan = useCallback((p: { scheduledAt?: string; timezone?: string }) => decide((id) => api.planDraft(id, p)), [decide]);
  /**
   * Save fields that are not part of the draft's own save. They take their turn behind pending changes, and whatever
   * acts next (approve, switching items) waits for them.
   */
  const aside = useCallback((id: string, send: () => Promise<Draft>) => {
    window.clearTimeout(timer.current);
    const done = saving.current.then(save).then(send).then((saved) => {
      commit(ref.current.map((x) => (x.id !== saved.id ? x : dirty.current === saved.id ? { ...x, revision: saved.revision, version: saved.version, versionIsCurrent: saved.versionIsCurrent, audience: saved.audience, topic: saved.topic, campaign: saved.campaign, reviewNotes: saved.reviewNotes, slug: saved.slug, summary: saved.summary } : meta(x, saved))));
      return id;
    });
    saving.current = done.then(() => undefined, () => undefined);
    return done.then(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setPlanning = useCallback((id: string, fields: Parameters<typeof api.setPlanning>[1]) => aside(id, () => api.setPlanning(id, fields)), [aside]);
  const setPageFields = useCallback((id: string, fields: Parameters<typeof api.setPageFields>[1]) => aside(id, () => api.setPageFields(id, fields)), [aside]);
  /** Re-read the open draft's status: a post sent from it changes it behind the screen. */
  const refreshStatus = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    try { const saved = await api.getDraft(id, true); commit(ref.current.map((x) => (x.id === saved.id && dirty.current !== x.id ? meta(x, saved) : x))); } catch { /* the next look will do */ }
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
  return { drafts, current, settled, reload, rev, restoreVersion, saveState, update, select, create, fresh, createFrom, remove, setKind, retry: flush, approve, unapprove, plan, publishPage, unpublishPage, setPlanning, setPageFields, refreshStatus, setAttachment, setAttachmentTitle, clearAttachment, setVideo, addImage, setImageAlt, orderImages, removeImage };
}

export type DraftStore = ReturnType<typeof useDrafts>;
