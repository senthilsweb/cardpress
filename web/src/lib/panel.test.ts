import { describe, expect, it } from "vitest";
import { moveTo, tabStop } from "./panel";

describe("panel list keys", () => {
  it("moves with the arrows and stops at the ends", () => {
    expect(moveTo("ArrowDown", 0, 3)).toBe(1);
    expect(moveTo("ArrowUp", 2, 3)).toBe(1);
    expect(moveTo("ArrowDown", 2, 3)).toBe(2);
    expect(moveTo("ArrowUp", 0, 3)).toBe(0);
  });

  it("jumps with Home and End and leaves other keys alone", () => {
    expect(moveTo("Home", 2, 3)).toBe(0);
    expect(moveTo("End", 0, 3)).toBe(2);
    expect(moveTo("Enter", 1, 3)).toBeNull();
    expect(moveTo("ArrowDown", 0, 0)).toBeNull();
  });
});

describe("panel list tab stop", () => {
  const groups = [{ items: [{ key: "a", name: "A" }] }, { name: "More", items: [{ key: "b", name: "B" }] }];

  it("is the picked item, else the first", () => {
    expect(tabStop(groups, "b")).toBe("b");
    expect(tabStop(groups, "")).toBe("a");
    expect(tabStop([], "a")).toBeUndefined();
  });
});
