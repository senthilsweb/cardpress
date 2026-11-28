import { describe, expect, it } from "vitest";
import { idleStep, warning, type IdleState } from "./idle";

const MIN = 60_000;
const at = (p: Partial<IdleState>): IdleState => ({ used: 0, told: 0, ends: 20 * MIN, limit: "idle", ...p });

describe("idle sign-out", () => {
  it("tells the server about use at most once a minute", () => {
    expect(idleStep(at({ used: 10_000 }), 30_000)).toBe("wait");
    expect(idleStep(at({ used: 10_000 }), MIN)).toBe("tell");
    expect(idleStep(at({ told: MIN, used: MIN - 1 }), 5 * MIN)).toBe("wait");
  });
  it("tells at once when the end is near, and otherwise asks how long is left", () => {
    expect(idleStep(at({ told: 18 * MIN, used: 18.5 * MIN }), 18.6 * MIN)).toBe("tell");
    expect(idleStep(at({}), 19 * MIN)).toBe("ask");
  });
  it("cannot extend past the longest time", () => {
    expect(idleStep(at({ limit: "max", used: 19 * MIN }), 19.5 * MIN)).toBe("ask");
  });
  it("warns in the last minute", () => {
    expect(warning(at({}), 18 * MIN)).toBeNull();
    expect(warning(at({}), 19.5 * MIN)).toBe(30);
    expect(warning(at({}), 21 * MIN)).toBe(0);
  });
});
