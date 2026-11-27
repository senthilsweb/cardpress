import { describe, expect, it } from "vitest";
import { Holds } from "./holds";

describe("holds on leaving a settings page", () => {
  it("asks only while a page says something would be lost", () => {
    const holds = new Holds();
    expect(holds.question()).toBeUndefined();
    holds.set("a", {});
    expect(holds.question()).toBeUndefined();
    holds.set("b", { ask: "Discard?" });
    expect(holds.question()).toBe("Discard?");
    holds.remove("b");
    expect(holds.question()).toBeUndefined();
  });

  it("saves what is waiting, and fails when a save fails", async () => {
    const holds = new Holds();
    let saved = 0;
    holds.set("a", { flush: async () => { saved++; } });
    await holds.flush();
    expect(saved).toBe(1);
    holds.set("b", { flush: () => Promise.reject(new Error("offline")) });
    await expect(holds.flush()).rejects.toThrow("offline");
  });
});
