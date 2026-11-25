/** What can be put into the message box besides words: files, a web address, or a long piece of text. */
export type Attachment =
  | { key: string; kind: "file"; file: File }
  | { key: string; kind: "url"; url: string }
  | { key: string; kind: "text"; text: string };

export const MAX_SOURCES = 10;
export const MAX_FILE_BYTES = 10 << 20;
/** A paste longer than this is something to write from, not part of the message. */
export const LONG_PASTE = 1500;
export const MIN_TEXT = 40;
export const FILE_TYPES = ".pdf,.docx,.md,.markdown,.txt";

/** Why a file cannot be attached, or null. The server checks again. */
export function fileProblem(name: string, size: number): string | null {
  if (!/\.(pdf|docx|md|markdown|txt)$/i.test(name)) return `${name}: attach a PDF, Word (.docx), Markdown or text file.`;
  if (size === 0) return `${name}: that file is empty.`;
  if (size > MAX_FILE_BYTES) return `${name}: that file is over 10 MB.`;
  return null;
}

/** The address, when the whole of what was given is one web address. */
export function asLink(input: string): string | undefined {
  const t = input.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return undefined;
  try { return new URL(t).hostname.includes(".") ? t : undefined; } catch { return undefined; }
}

export function attachmentName(a: Attachment): string {
  if (a.kind === "file") return a.file.name;
  if (a.kind === "url") return a.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return `Pasted text · ${a.text.length.toLocaleString()} characters`;
}
