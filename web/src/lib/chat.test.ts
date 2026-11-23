import { describe, expect, it } from "vitest";
import { docFromAgentText, parseHashtagList } from "./chat";
import { serializeForLinkedIn } from "./linkedin";

const types = (d: { content?: { type: string }[] }) => (d.content ?? []).map((n) => n.type);

describe("docFromAgentText", () => {
  it("turns paragraphs and bullets into real blocks", () => {
    const d = docFromAgentText("Hook line.\n\n- one\n- two\n\nWhat do you think?", "post");
    expect(types(d)).toEqual(["paragraph", "bulletList", "paragraph"]);
    expect(serializeForLinkedIn(d).text).toBe("Hook line.\n\n• one\n• two\n\nWhat do you think?");
  });
  it("handles a bullet list written straight after a paragraph line", () => {
    const d = docFromAgentText("Intro\n- a\n- b", "post");
    expect(types(d)).toEqual(["paragraph", "bulletList"]);
  });
  it("reads numbered lines", () => {
    const d = docFromAgentText("1. first\n2) second", "post");
    expect(types(d)).toEqual(["orderedList"]);
    expect(serializeForLinkedIn(d).text).toBe("1. first\n2. second");
  });
  it("keeps headings in an article and flattens them in a post", () => {
    const body = "## Title\n\nIntro.\n\n### Part\n\n- x";
    expect(types(docFromAgentText(body, "article"))).toEqual(["heading", "paragraph", "heading", "bulletList"]);
    const levels = docFromAgentText(body, "article").content!.filter((n) => n.type === "heading").map((n) => n.attrs?.level);
    expect(levels).toEqual([2, 3]);
    expect(types(docFromAgentText(body, "post"))).toEqual(["paragraph", "paragraph", "paragraph", "bulletList"]);
    expect(serializeForLinkedIn(docFromAgentText(body, "post")).text).toBe("Title\n\nIntro.\n\nPart\n\n• x");
  });
  it("keeps single line breaks inside a paragraph", () => {
    expect(serializeForLinkedIn(docFromAgentText("line a\nline b", "post")).text).toBe("line a\nline b");
  });
  it("gives an empty editable document for nothing", () => {
    expect(docFromAgentText("  \n\n ", "post").content).toEqual([{ type: "paragraph" }]);
  });
  it("never produces a node a post editor cannot hold", () => {
    const allowed = new Set(["doc", "paragraph", "bulletList", "orderedList", "listItem", "text", "hardBreak"]);
    const walk = (n: { type: string; content?: unknown[] }): boolean => allowed.has(n.type) && (n.content ?? []).every((c) => walk(c as never));
    expect(walk(docFromAgentText("## H\n\ntext\n- a\n1. b\n> quote", "post") as never)).toBe(true);
  });
});

describe("parseHashtagList", () => {
  it("splits on spaces and commas, strips #, drops junk and repeats", () => {
    expect(parseHashtagList("#Go, data  #AI go, !!, #Data_Eng")).toEqual(["Go", "data", "AI", "Data_Eng"]);
    expect(parseHashtagList("")).toEqual([]);
  });
});
