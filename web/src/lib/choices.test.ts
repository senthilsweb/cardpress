import { describe, expect, it } from "vitest";
import type { Choice, Conversation } from "./chat";
import { ofReply, optionText, picked, preview, selected } from "./choices";
import { EMPTY_DOC, type Draft } from "./draft";
import { DEFAULT_DESIGN } from "./profiles";

const draft: Draft = { id: "d", revision: 1, version: 1, versionIsCurrent: false, profileId: "p", kind: "post", status: "draft", doc: EMPTY_DOC,
  hashtags: ["data"], altText: "", unicodeStyles: false, title: "Old", createdAt: "", updatedAt: "" };
const offer = (id: string, field: string, values: (string | string[])[], more: Partial<Choice> = {}): Choice =>
  ({ id, messageId: "m", draftId: "d", kind: "post", field, options: values.map((value) => ({ value })), status: "pending", chosen: -1, ...more });
const card = { ...DEFAULT_DESIGN, title: "Saved headline" };

describe("preview", () => {
  const choices = [offer("h", "headline", ["Saved headline", "Another"]), offer("t", "title", ["Old", "New"])];
  it("shows a picked option without touching the draft", () => {
    const v = preview(draft, card, choices, { h: 1, t: 1 });
    expect([v.design.title, v.draft.title, v.on]).toEqual(["Another", "New", true]);
    expect([draft.title, card.title]).toEqual(["Old", "Saved headline"]);
  });
  it("is off when nothing differs, or the offer is gone or about another item", () => {
    expect(preview(draft, card, choices, { h: 0 }).on).toBe(false);
    expect(preview(draft, card, [offer("t", "title", ["Old", "New"], { status: "superseded" })], { t: 1 }).on).toBe(false);
    expect(preview({ ...draft, id: "other" }, card, choices, { t: 1 }).on).toBe(false);
  });
});

describe("taking words off the card", () => {
  const c = offer("e", "eyebrow", ["Notes", ""]);
  it("previews an empty option and names it", () => {
    expect(preview(draft, { ...card, eyebrow: "Notes" }, [c], { e: 1 }).design.eyebrow).toBe("");
    expect([optionText("", "eyebrow"), optionText("", "footerLeft")]).toEqual(["None", "Brand default"]);
  });
});

describe("a reply's options", () => {
  const a = offer("a", "title", ["x", "y"]), b = offer("b", "headline", ["x", "y"], { chosen: 1, status: "chosen" });
  it("selects the pick, then the saved one, then the recommended", () => {
    expect([selected(a, {}), selected(b, {}), selected(b, { b: 0 })]).toEqual([0, 1, 0]);
  });
  it("sends only what was picked", () => expect(picked([a, b], { b: 0 })).toEqual([{ choiceId: "b", option: 0 }]));
  it("leaves out offers that were replaced", () => {
    const conv = { choices: [a, offer("c", "title", ["1", "2"], { status: "dismissed" })], changes: [] } as unknown as Conversation;
    expect(ofReply(conv, "m").choices).toEqual([a]);
  });
});
