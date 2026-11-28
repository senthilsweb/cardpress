import { describe, expect, it } from "vitest";
import type { ChatMessage, Conversation } from "./chat";
import { answered, checkLine, savedLine, withOlder, hasOutcome } from "./reply";

describe("reply cards", () => {
  it("say what was saved and how the check went", () => {
    expect(savedLine({ draftId: "d", kind: "article", version: 2 })).toBe("Saved: Article v2");
    expect(checkLine({ kind: "post", passed: true, round: 1 })).toBe("Post check passed.");
    expect(checkLine({ kind: "post", passed: true, round: 2 })).toBe("Post check passed (round 2).");
    expect(checkLine({ kind: "article", passed: false, note: "x" })).toBe("Article check not passed.");
  });
});

describe("older conversations", () => {
  const c = (id: string, title = id) => ({ id, title }) as Conversation;
  it("follow the newest, each once", () => {
    expect(withOlder([c("a", "new name"), c("b")], [c("a"), c("z")]).map((x) => x.title)).toEqual(["new name", "b", "z"]);
  });
});

it("a reply that is only words has no card", () => {
  expect(hasOutcome(undefined)).toBe(false);
  expect(hasOutcome({ reports: [{ message: "Which source?" }] })).toBe(false);
  expect(hasOutcome({ steps: ["Saving the draft"] })).toBe(true);
});

it("a question's answer is the next message, when it is one of the buttons", () => {
  const m = (role: "user" | "assistant", content: string) => ({ role, content }) as ChatMessage;
  expect(answered([m("assistant", "?")], 0, ["Yes", "No"])).toBeUndefined();
  expect(answered([m("assistant", "?"), m("user", " yes ")], 0, ["Yes", "No"])).toBe("Yes");
  expect(answered([m("assistant", "?"), m("user", "Not yet")], 0, ["Yes", "No"])).toBeUndefined();
  expect(answered([m("assistant", "?"), m("assistant", "Yes")], 0, ["Yes"])).toBeUndefined();
});
