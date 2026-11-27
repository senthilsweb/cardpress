/** A brand's media library: what an entry is, and what the browser does to a file before sending it. */

export type AssetKind = "image" | "pdf" | "video";
export interface Asset { id: string; profileId: string; kind: AssetKind; name: string; tags: string[]; mime?: string; size?: number; width?: number; height?: number; link?: string; hasThumb: boolean; createdBy?: string; createdAt: string }
/** One page of a library, with what is true of the whole: how many entries, every tag, how full. */
export interface Assets { items: Asset[]; total: number; page: number; pages: number; pageSize: number; count: number; tags: string[]; usedBytes: number; limitBytes: number }
export interface AssetQuery { text: string; kind: "" | AssetKind; tag: string; page: number; pageSize: number }
export const ASSET_PAGE_SIZES = [12, 24, 48] as const;

export function assetParams(q: AssetQuery): URLSearchParams {
  const p = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
  if (q.text.trim()) p.set("q", q.text.trim());
  if (q.kind) p.set("kind", q.kind);
  if (q.tag) p.set("tag", q.tag);
  return p;
}

// the server's limits, so a file is refused before it is sent
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_SIDE = 2400;
export const THUMB_SIDE = 320;
const PICTURES = ["image/png", "image/jpeg", "image/webp"];
export const ACCEPT = [...PICTURES, "application/pdf"].join(",");

export const KIND_LABEL: Record<AssetKind, string> = { image: "Image", pdf: "PDF", video: "Video" };

/** "860 KB", "1.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** Why a chosen file cannot be added; empty when it can. A large picture is fine: it is reduced first. */
export function fileProblem(f: { type: string; size: number }): string {
  if (f.type.startsWith("video/")) return "Videos are added as a link, not a file.";
  if (f.type === "application/pdf") return f.size > MAX_PDF_BYTES ? "A PDF can be at most 20 MB." : "";
  if (!PICTURES.includes(f.type)) return "Add a PNG, JPEG or WebP picture, or a PDF.";
  return f.size > 4 * MAX_IMAGE_BYTES ? "That picture is too large to open." : "";
}

/** The size that fits within `max` on the long side, never enlarged. */
export function fit(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A name for a file's entry: the file's name without its ending. */
export const nameFromFile = (file: string) => (file.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/\s+/g, " ").trim() || "Untitled").slice(0, 120);

/** Typed tags, separated by commas, without blanks or repeats. */
export function splitTags(text: string): string[] {
  const seen = new Set<string>();
  return text.split(",").map((t) => t.replace(/\s+/g, " ").trim()).filter((t) => t && !seen.has(t.toLowerCase()) && !!seen.add(t.toLowerCase()));
}

const open = (file: Blob) => new Promise<HTMLImageElement>((ok, fail) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); ok(img); };
  img.onerror = () => { URL.revokeObjectURL(url); fail(new Error("That file is not a picture the browser can open.")); };
  img.src = url;
});

function draw(img: HTMLImageElement, max: number, type: string, quality?: number): Promise<Blob> {
  const size = fit(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("This browser cannot resize pictures."));
  ctx.drawImage(img, 0, 0, size.width, size.height);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("The picture could not be resized."))), type, quality));
}

/**
 * What is sent for a chosen file. A picture is reduced to 2,400 px and given a thumbnail. A JPEG is always drawn again,
 * which leaves behind where and with what a photo was taken; a PNG or WebP that already fits is sent as it is.
 */
export async function prepareUpload(file: File): Promise<{ file: Blob; thumb?: Blob }> {
  if (file.type === "application/pdf") return { file };
  const img = await open(file);
  const fits = Math.max(img.naturalWidth, img.naturalHeight) <= MAX_SIDE && file.size <= MAX_IMAGE_BYTES;
  let out: Blob = file;
  if (file.type === "image/jpeg") out = await draw(img, MAX_SIDE, "image/jpeg", 0.9);
  else if (!fits) {
    out = await draw(img, MAX_SIDE, "image/png");
    if (out.size > MAX_IMAGE_BYTES) out = await draw(img, MAX_SIDE, "image/jpeg", 0.88);
  }
  if (out.size > MAX_IMAGE_BYTES) throw new Error("That picture is still larger than 10 MB.");
  // a PNG or WebP may be see-through, which JPEG would paint black
  const thumb = await draw(img, THUMB_SIDE, file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.82);
  return { file: out, thumb };
}
