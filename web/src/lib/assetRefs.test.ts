import { describe, expect, it, vi } from "vitest";
import { assetRef, assetsSettled, shownPicture, embedPictures, fillPictures, isAssetRef, picturesOf, refsIn } from "./assetRefs";
import { api } from "./api";

describe("library pictures", () => {
  it("knows a reference from a picture", () => {
    expect(assetRef("ab12")).toBe("asset:ab12");
    expect([isAssetRef("asset:ab12"), isAssetRef("data:image/png;base64,x"), isAssetRef(undefined)]).toEqual([true, false, false]);
    expect(refsIn(["asset:1", "data:x", undefined, "asset:1", "asset:2"])).toEqual(["asset:1", "asset:2"]);
  });

  it("fills a card and its brand for drawing, leaving out what is not here", () => {
    const design = { photos: ["asset:1", "data:own", "asset:2"], screenshot: "asset:3", bgImage: undefined };
    const profile = { logoImage: "asset:1", headshot: "data:face" };
    const show = (v?: string) => (v === "asset:1" ? "data:one" : isAssetRef(v) ? undefined : v);
    expect(fillPictures(design, profile, show)).toEqual({
      design: { photos: ["data:one", "data:own"], screenshot: undefined, bgImage: undefined },
      profile: { logoImage: "data:one", headshot: "data:face" },
    });
    expect(picturesOf(design, profile)).toHaveLength(7);
    const plain = { photos: ["data:a"] };
    expect(fillPictures(plain, {}, show).design).toBe(plain);
  });

  it("puts the pictures into a copy, or refuses", async () => {
    vi.stubGlobal("FileReader", class { result = "data:copied"; onload?: () => void; readAsDataURL() { queueMicrotask(() => this.onload?.()); } });
    const spy = vi.spyOn(api, "assetBlob").mockImplementation(async (_b, id) => { if (id === "dead00") throw new Error("gone"); return new Blob(["x"]); });
    await expect(embedPictures("b", { name: "N", logoImage: "asset:aa11", list: ["asset:aa11"] })).resolves.toEqual({ name: "N", logoImage: "data:copied", list: ["data:copied"] });
    expect(spy).toHaveBeenCalledTimes(1);
    await expect(embedPictures("b", { bgImage: "asset:dead00" })).rejects.toThrow("media library");
    // it works the next time: an image of a card asks again for what failed
    spy.mockImplementation(async () => new Blob(["y"]));
    await assetsSettled();
    expect(shownPicture("b", "asset:dead00")).toBe("data:copied");
    vi.unstubAllGlobals(); spy.mockRestore();
  });
});
