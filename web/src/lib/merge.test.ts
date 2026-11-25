import { describe, expect, it } from "vitest";
import { anyTouched, merge, note, untouched } from "./merge";
import type { Draft } from "./draft";

const d = (over: Record<string, unknown>) =>
  ({ id: "d", revision: 1, title: "T", altText: "", hashtags: [], doc: { type: "doc" }, design: { title: "Old", background: "mesh" }, ...over }) as unknown as Draft;

describe("note", () => {
  it("records the fields edited, and only the card settings that differ", () => {
    const t = note(untouched(), d({}), { altText: "x", design: { title: "Old", background: "dots" } });
    expect([...t.fields]).toEqual(["altText"]);
    expect([...t.design]).toEqual(["background"]);
    expect(anyTouched(untouched())).toBe(false);
  });
});

describe("merge", () => {
  const local = d({ altText: "mine", title: "stale", design: { title: "Old", background: "dots" } });
  const server = d({ revision: 5, title: "theirs", design: { title: "New from the assistant", background: "mesh" } });
  it("keeps both sides' changes to the card", () => {
    const m = merge(server, local, note(untouched(), d({}), { altText: "mine", design: local.design }));
    expect(m.revision).toBe(5);
    expect(m.title).toBe("theirs");
    expect(m.altText).toBe("mine");
    expect(m.design).toEqual({ title: "New from the assistant", background: "dots" });
  });
  it("is the server's draft when nothing was touched", () => expect(merge(server, local, untouched())).toEqual(server));
});
