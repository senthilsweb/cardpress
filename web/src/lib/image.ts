/** Read an image file, downscale it so the long side is at most `max` px, return a data URL. */
export function fileToDataUrl(file: File, max = 1600, keepPng = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      const png = keepPng || file.type === "image/png" || file.type === "image/svg+xml";
      resolve(c.toDataURL(png ? "image/png" : "image/jpeg", 0.9));
      URL.revokeObjectURL(url);
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}
