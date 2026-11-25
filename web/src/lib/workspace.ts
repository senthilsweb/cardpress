import type { Draft } from "./draft";

/** What a conversation is about: at most one post and one article. */
export interface Linked { id: string; postDraftId?: string; articleDraftId?: string }

export const linksDraft = (c: Linked, draftId: string) => c.postDraftId === draftId || c.articleDraftId === draftId;

/** The conversation about an item: the open one if it is about it, else the latest (the list is newest first). */
export function conversationFor<C extends Linked>(draftId: string, list: C[], openId?: string): C | undefined {
  return list.find((c) => c.id === openId && linksDraft(c, draftId)) ?? list.find((c) => linksDraft(c, draftId));
}

/**
 * The items the canvas can show: the one being worked on, and its partner of the other kind from the same conversation.
 * A link is read by the item's own kind, so an item whose type was changed since it was linked still lands correctly.
 */
export function pairFor<C extends Linked>(current: Draft | undefined, drafts: Draft[], list: C[], openId?: string): { post?: Draft; article?: Draft } {
  if (!current) return {};
  const pair: { post?: Draft; article?: Draft } = { [current.kind]: current };
  const conv = conversationFor(current.id, list, openId);
  for (const id of [conv?.postDraftId, conv?.articleDraftId]) {
    const d = drafts.find((x) => x.id === id);
    if (d && !pair[d.kind]) pair[d.kind] = d;
  }
  return pair;
}
