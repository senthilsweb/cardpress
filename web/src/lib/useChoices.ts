import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { ofReply, picked, type Picks } from "./choices";
import type { Choice } from "./chat";
import type { ChatStore } from "./useChat";
import type { DraftStore } from "./useDrafts";

/**
 * The options picked on screen, and saving or undoing a reply. A pick is only a preview until it is saved; it is
 * dropped when another conversation is opened.
 */
export function useChoices(chat: ChatStore, store: DraftStore, show: (draftId: string) => void) {
  const [picks, setPicks] = useState<Picks>({});
  const conv = chat.current;
  useEffect(() => setPicks({}), [conv?.id]);
  const choices = useMemo(() => conv?.choices ?? [], [conv?.choices]);

  const pick = (c: Choice, option: number) => {
    setPicks((p) => ({ ...p, [c.id]: option }));
    if (c.draftId !== store.current?.id && store.drafts.some((d) => d.id === c.draftId)) show(c.draftId); // preview it where it shows
  };
  const drop = (ids: string[]) => setPicks((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !ids.includes(k))));

  /** Run one action on a reply, with edits saved first and the items it touched read again after. */
  const run = async (messageId: string, action: "save" | "undo") => {
    if (!conv) return;
    const mine = ofReply(conv, messageId);
    const ids = [...new Set([...mine.changes, ...mine.choices].map((x) => x.draftId))];
    const done = await chat.act(conv.id, async () => {
      const revisions = await store.settled();
      if (action === "undo") return api.undoReply(conv.id, messageId);
      return api.saveReply(conv.id, messageId, { picks: picked(mine.choices, picks), revisions: Object.fromEntries(ids.filter((id) => revisions[id]).map((id) => [id, revisions[id]])) });
    });
    await store.reload(ids.filter((id) => store.drafts.some((d) => d.id === id))).catch(() => undefined);
    if (done) drop(mine.choices.map((c) => c.id));
  };

  return { picks, choices, pick, drop, save: (m: string) => run(m, "save"), undo: (m: string) => run(m, "undo"), busy: chat.busy };
}

export type ChoiceStore = ReturnType<typeof useChoices>;
export const ChoiceContext = createContext<ChoiceStore | null>(null);
export const useChoiceContext = () => useContext(ChoiceContext);
