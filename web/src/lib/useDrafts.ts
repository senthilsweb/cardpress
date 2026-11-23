import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { flattenForPost, EMPTY_DOC, type Draft, type DraftInput, type DraftKind } from "./draft";

export type SaveState = "saved" | "saving" | "error";
type Patch = Partial<Omit<DraftInput, "profileId">>;

const toInput = (d: Draft): DraftInput => ({ profileId: d.profileId, kind: d.kind, doc: d.doc, hashtags: d.hashtags, altText: d.altText, unicodeStyles: d.unicodeStyles });

/**
 * The profile's drafts and the one being edited. Changes show at once and are saved after a short pause;
 * switching, creating or deleting a draft saves any pending change first.
 */
export function useDrafts(profileId: string, initial: Draft[]) {
  const [drafts, setDrafts] = useState<Draft[]>(initial);
  const [currentId, setCurrentId] = useState(initial[0]?.id ?? "");
  const [saveState, setSaveState] = useState<SaveState>("saved");
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
      await api.updateDraft(d.id, toInput(d));
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
    commit(ref.current.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d)));
    dirty.current = id;
    setSaveState("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  }, [flush]);

  const select = useCallback(async (id: string) => { await flush(); setCurrentId(id); }, [flush]);

  const create = useCallback(async (kind: DraftKind = "post") => {
    await flush();
    const d = await api.createDraft({ profileId, kind, doc: EMPTY_DOC, hashtags: [], altText: "", unicodeStyles: false });
    commit([d, ...ref.current]);
    setCurrentId(d.id);
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

  const current = drafts.find((d) => d.id === currentId) ?? drafts[0];
  return { drafts, current, saveState, update, select, create, remove, setKind, retry: flush };
}

export type DraftStore = ReturnType<typeof useDrafts>;
