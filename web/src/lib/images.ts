/**
 * Pictures for an article are kept inside its text as base64, so one row in the database holds the whole piece. They are
 * shrunk first: a phone photo would otherwise be several megabytes.
 */
export const MAX_IMAGE_SIDE = 1600;
/** The server limit for one document is 25 MB; stay well under it. */
export const MAX_DOC_BYTES = 24 * 1024 * 1024;

const ACCEPT = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
export const isPicture = (f: File) => ACCEPT.has(f.type);

const read = (f: Blob) => new Promise<string>((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result));
  r.onerror = () => fail(new Error("Could not read the picture"));
  r.readAsDataURL(f);
});

const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const i = new Image();
  i.onload = () => ok(i);
  i.onerror = () => fail(new Error("That file is not a picture the browser can open"));
  i.src = src;
});

/** A picture as a data URL, no longer than MAX_IMAGE_SIDE on its long side. Animated and vector pictures are kept as they are. */
export async function pictureToDataUrl(file: File): Promise<string> {
  if (!isPicture(file)) throw new Error("Choose a PNG, JPEG, WebP, GIF or SVG picture");
  const original = await read(file);
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    if (file.size > 3 * 1024 * 1024) throw new Error("That picture is larger than 3 MB");
    return original;
  }
  const img = await load(original);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return original;
  const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, w, h);
  // a screenshot or diagram stays PNG while it is small; a photo (or a large PNG) becomes JPEG
  if (file.type === "image/png") {
    const png = canvas.toDataURL("image/png");
    if (png.length < 2 * 1024 * 1024) return png;
  }
  return canvas.toDataURL("image/jpeg", 0.86);
}
