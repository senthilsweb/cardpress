import { toBlob, getFontEmbedCSS } from "html-to-image";
import { fontsSettled, loadedKey } from "./fonts";

let fontCss: string | undefined;
let fontCssKey = "";

/** Render a card element (already in the DOM at native size) to a PNG blob. */
export async function cardToBlob(node: HTMLElement, w: number, h: number): Promise<Blob> {
  await fontsSettled();
  if (document.fonts?.ready) await document.fonts.ready;
  const key = loadedKey();
  if (fontCss === undefined || key !== fontCssKey) {
    try { fontCss = await getFontEmbedCSS(node); } catch { fontCss = ""; }
    fontCssKey = key;
  }
  const blob = await toBlob(node, {
    width: w,
    height: h,
    pixelRatio: 1,
    cacheBust: false,
    fontEmbedCSS: fontCss || undefined,
    style: { transform: "none", position: "relative", left: "0", top: "0" },
  });
  if (!blob) throw new Error("Could not render image");
  return blob;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function copyBlob(blob: Blob) {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
