import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { hydratePrefs, readPref, savePref } from "./prefs";

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("view choices", () => {
  const put = vi.spyOn(api, "putPreference").mockResolvedValue(undefined);
  beforeEach(() => { put.mockClear(); hydratePrefs({}); });

  it("reads what the server sent and ignores anything that is not an object", () => {
    hydratePrefs({ ui: { "media.view": "list" } });
    expect(readPref("media.view")).toBe("list");
    hydratePrefs({ ui: ["list"] });
    expect(readPref("media.view")).toBeUndefined();
  });
  it("saves all choices together, and only when one changes", async () => {
    hydratePrefs({ ui: { a: 1 } });
    savePref("a", 1);
    savePref("b", [2]);
    savePref("b", [2]);
    await settle();
    expect(put.mock.calls).toEqual([["ui", { a: 1, b: [2] }]]);
    expect(readPref("b")).toEqual([2]);
  });
});
