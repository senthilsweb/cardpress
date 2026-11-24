import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrailing, flushPendingEdits, registerFlusher } from "./pendingEdits";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("createTrailing", () => {
  it("runs once with the latest value after the pause", () => {
    const run = vi.fn();
    const t = createTrailing<number>(run, 250);
    t.push(1); vi.advanceTimersByTime(200);
    t.push(2); vi.advanceTimersByTime(200);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(2);
    expect(t.pending()).toBe(false);
  });
  it("flush runs at once, and the timer then does nothing more", () => {
    const run = vi.fn();
    const t = createTrailing<string>(run, 250);
    t.push("a");
    expect(t.pending()).toBe(true);
    t.flush();
    expect(run).toHaveBeenCalledWith("a");
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("flush with nothing waiting does nothing", () => {
    const run = vi.fn();
    createTrailing(run, 250).flush();
    expect(run).not.toHaveBeenCalled();
  });
});

describe("flushPendingEdits", () => {
  it("calls every registered flusher until it is removed", () => {
    const a = vi.fn(); const b = vi.fn();
    const offA = registerFlusher(a); registerFlusher(b)();
    flushPendingEdits();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    offA();
    flushPendingEdits();
    expect(a).toHaveBeenCalledTimes(1);
  });
});
