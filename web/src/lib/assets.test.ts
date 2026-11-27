import { describe, expect, it } from "vitest";
import { allTags, fileProblem, fileSize, findAssets, fit, nameFromFile, splitTags, type Asset } from "./assets";

const asset = (name: string, kind: Asset["kind"], tags: string[] = []): Asset => ({ id: name, profileId: "b", kind, name, tags, hasThumb: false, createdAt: "" });

describe("media library", () => {
  it("writes sizes", () => {
    expect(fileSize(900)).toBe("900 B");
    expect(fileSize(880 * 1024)).toBe("880 KB");
    expect(fileSize(1.45 * 1024 * 1024)).toBe("1.5 MB");
    expect(fileSize(200 * 1024 * 1024)).toBe("200 MB");
  });

  it("refuses what the server would", () => {
    expect(fileProblem({ type: "image/png", size: 1000 })).toBe("");
    expect(fileProblem({ type: "image/jpeg", size: 15 * 1024 * 1024 })).toBe("");
    expect(fileProblem({ type: "video/mp4", size: 1 })).toMatch(/link/);
    expect(fileProblem({ type: "image/svg+xml", size: 1 })).toMatch(/PNG/);
    expect(fileProblem({ type: "application/pdf", size: 21 * 1024 * 1024 })).toMatch(/20 MB/);
  });

  it("fits a picture without enlarging it", () => {
    expect(fit(4800, 3200, 2400)).toEqual({ width: 2400, height: 1600 });
    expect(fit(100, 50, 2400)).toEqual({ width: 100, height: 50 });
    expect(fit(10000, 1, 320)).toEqual({ width: 320, height: 1 });
  });

  it("names entries and reads tags", () => {
    expect(nameFromFile("Team  photo.final.JPG")).toBe("Team photo.final");
    expect(nameFromFile(".png")).toBe("Untitled");
    expect(splitTags(" team, Team ,, year  end ")).toEqual(["team", "year end"]);
  });

  it("finds by words, kind and tag", () => {
    const items = [asset("Logo dark", "image", ["Brand"]), asset("Price list", "pdf", ["sales"]), asset("Launch talk", "video", ["brand", "events"])];
    expect(allTags(items).map((t) => t.toLowerCase())).toEqual(["brand", "events", "sales"]);
    expect(findAssets(items, { text: "", kind: "", tag: "" })).toHaveLength(3);
    expect(findAssets(items, { text: "brand lau", kind: "", tag: "" }).map((a) => a.name)).toEqual(["Launch talk"]);
    expect(findAssets(items, { text: "", kind: "image", tag: "BRAND" }).map((a) => a.name)).toEqual(["Logo dark"]);
    expect(findAssets(items, { text: "price", kind: "video", tag: "" })).toEqual([]);
  });
});
