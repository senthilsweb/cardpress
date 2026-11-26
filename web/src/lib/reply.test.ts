import { describe, expect, it } from "vitest";
import type { Conversation } from "./chat";
import { checkLine, savedLine, withOlder } from "./reply";

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
