import { describe, expect, it } from "vitest";
import { lockReason } from "./lock";

describe("lockReason", () => {
  it("leaves drafts and approved items open", () => {
    expect(lockReason({ kind: "post", status: "draft" })).toBeNull();
    expect(lockReason({ kind: "article", status: "approved" })).toBeNull();
    expect(lockReason(undefined)).toBeNull();
  });
  it("closes what is waiting or published", () => {
    expect(lockReason({ kind: "post", status: "scheduled" })).toContain("waiting");
    expect(lockReason({ kind: "post", status: "published" })).toContain("This post is published");
    expect(lockReason({ kind: "article", status: "approved", pageAt: "2026-01-01" })).toContain("This article is published");
  });
});
