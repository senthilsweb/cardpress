import { describe, expect, it } from "vitest";
import type { Draft } from "./draft";
import { blankCard, isBlank } from "./fresh";
import { DEFAULT_DESIGN } from "./profiles";

const draft = (over: Partial<Draft> = {}): Draft => ({
  id: "d", revision: 1, version: 1, versionIsCurrent: true, profileId: "p", kind: "post", status: "draft",
  doc: { type: "doc", content: [{ type: "paragraph" }] }, hashtags: [], altText: "", unicodeStyles: false, title: "",
  design: blankCard(DEFAULT_DESIGN), createdAt: "", updatedAt: "", ...over,
} as Draft);

describe("starting fresh", () => {
  it("keeps the brand's look and drops every word and picture", () => {
    const card = blankCard({ ...DEFAULT_DESIGN, title: "Old", statValue: "9", footer: "@me", background: "mesh", photos: ["x"], bgImage: "y", screenshot: "z" });
    expect(card).toMatchObject({ eyebrow: "", title: "", subtitle: "", tag: "", quoteAuthor: "", statValue: "", footer: "@me", background: "mesh", photos: [] });
    expect(card.bgImage).toBeUndefined();
    expect(card.screenshot).toBeUndefined();
  });
  it("uses a draft again only when nothing was put into it", () => {
    expect(isBlank(draft())).toBe(true);
    expect(isBlank(draft({ title: "T" }))).toBe(false);
    expect(isBlank(draft({ status: "approved" }))).toBe(false);
    expect(isBlank(draft({ doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] } }))).toBe(false);
    expect(isBlank(draft({ design: { ...blankCard(DEFAULT_DESIGN), subtitle: "s" } }))).toBe(false);
    expect(isBlank(draft({ design: undefined }))).toBe(false); // shown with the brand's card, words and all
  });
});
