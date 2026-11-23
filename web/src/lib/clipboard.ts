/** Copy rich content. Pastes as formatted text where the target allows it, and as plain text elsewhere. */
export async function copyFormatted(html: string, text: string): Promise<"rich" | "plain"> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      return "rich";
    } catch {
      /* fall back to plain text below */
    }
  }
  await navigator.clipboard.writeText(text);
  return "plain";
}
