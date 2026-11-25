import { describe, expect, it } from "vitest";
import { asLink, attachmentName, fileProblem, MAX_FILE_BYTES } from "./compose";

describe("fileProblem", () => {
  it("takes the types the server reads, in any case", () => {
    for (const n of ["a.pdf", "b.DOCX", "c.md", "d.markdown", "e.txt"]) expect(fileProblem(n, 10)).toBeNull();
  });
  it("says why not", () => {
    expect(fileProblem("a.png", 10)).toContain("PDF, Word");
    expect(fileProblem("a.pdf", 0)).toContain("empty");
    expect(fileProblem("a.pdf", MAX_FILE_BYTES + 1)).toContain("10 MB");
  });
});

describe("asLink", () => {
  it("is a link only when that is all there is", () => {
    expect(asLink("  https://example.com/a?b=1 ")).toBe("https://example.com/a?b=1");
    for (const t of ["see https://example.com", "https://", "ftp://example.com", "https://localhost", "example.com", "https://a.io\nmore"]) expect(asLink(t)).toBeUndefined();
  });
});

describe("attachmentName", () => {
  it("is short", () => {
    expect(attachmentName({ key: "1", kind: "url", url: "https://www.example.com/post/" })).toBe("example.com/post");
    expect(attachmentName({ key: "2", kind: "text", text: "x".repeat(2000) })).toContain("2,000");
  });
});
