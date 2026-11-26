import { describe, expect, it } from "vitest";
import { deleteSummary, nextSort, rowActions, type LibraryItem } from "./library";

const item = (p: Partial<LibraryItem>): LibraryItem => ({ type: "draft", id: "d1", profileId: "p", kind: "post", status: "draft", title: "T", excerpt: "", at: "2026-11-25T10:00:00Z", ...p });
const all = () => true;

describe("the grid's rows", () => {
  it("lets a draft be edited and deleted, and an approved one scheduled or taken back", () => {
    expect(rowActions(item({}), all)).toMatchObject({ edit: true, delete: true, schedule: false, backToDraft: false });
    const ok = rowActions(item({ status: "approved" }), all);
    expect(ok).toMatchObject({ edit: true, schedule: true, backToDraft: true, delete: false, deleteWhy: "Bring it back to draft first" });
  });

  it("shows a sent post read-only, and deletes only its record", () => {
    const a = rowActions(item({ type: "job", status: "published" }), all);
    expect(a).toMatchObject({ edit: false, readOnly: true, delete: true, recordOnly: true });
  });

  it("will not delete a post that is waiting to go out", () => {
    expect(rowActions(item({ type: "job", status: "scheduled" }), all)).toMatchObject({ delete: false, deleteWhy: "Cancel the scheduled post first" });
  });

  it("follows the person's role", () => {
    const writer = (p: string) => p === "write";
    expect(rowActions(item({ status: "approved" }), writer).schedule).toBe(false);
    expect(rowActions(item({ type: "job", status: "failed" }), writer).delete).toBe(false);
  });

  it("says what a delete removes", () => {
    const s = deleteSummary([item({}), item({ id: "d2" }), item({ type: "job", status: "published" })]);
    expect(s).toMatchObject({ drafts: 2, records: 1 });
    expect(s.text).toContain("stays on LinkedIn");
  });

  it("sorts by a column, then turns the order round", () => {
    expect(nextSort({ sort: "at", order: "desc" }, "title")).toEqual({ sort: "title", order: "asc" });
    expect(nextSort({ sort: "title", order: "asc" }, "title")).toEqual({ sort: "title", order: "desc" });
    expect(nextSort({ sort: "title", order: "asc" }, "at")).toEqual({ sort: "at", order: "desc" });
  });
});
