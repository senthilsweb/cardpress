import { describe, expect, it } from "vitest";
import { conversationFor, pairFor } from "./workspace";
import type { Draft } from "./draft";

const d = (id: string, kind: "post" | "article") => ({ id, kind }) as Draft;
const drafts = [d("p1", "post"), d("a1", "article"), d("p2", "post"), d("a2", "article")];
const list = [
  { id: "new", postDraftId: "p1", articleDraftId: "a2" },
  { id: "old", postDraftId: "p1", articleDraftId: "a1" },
  { id: "none" },
];

describe("conversationFor", () => {
  it("takes the latest about an item, unless the open one is about it", () => {
    expect(conversationFor("p1", list)?.id).toBe("new");
    expect(conversationFor("p1", list, "old")?.id).toBe("old");
    expect(conversationFor("a1", list, "new")?.id).toBe("old");
    expect(conversationFor("p2", list, "none")).toBeUndefined();
  });
});

describe("pairFor", () => {
  it("shows an item on its own when no conversation is about it", () => {
    expect(pairFor(drafts[2], drafts, list)).toEqual({ post: drafts[2] });
    expect(pairFor(undefined, drafts, list)).toEqual({});
  });
  it("adds the partner from the conversation, from either side", () => {
    expect(pairFor(drafts[0], drafts, list)).toEqual({ post: drafts[0], article: drafts[3] });
    expect(pairFor(drafts[1], drafts, list)).toEqual({ post: drafts[0], article: drafts[1] });
    expect(pairFor(drafts[0], drafts, list, "old")).toEqual({ post: drafts[0], article: drafts[1] });
  });
  it("leaves out a deleted partner, and reads a link by the item's own kind", () => {
    expect(pairFor(drafts[0], [drafts[0]], list)).toEqual({ post: drafts[0] });
    const changed = d("p1", "article"); // linked as a post, since turned into an article
    expect(pairFor(changed, [changed, drafts[3]], list)).toEqual({ article: changed });
  });
});
