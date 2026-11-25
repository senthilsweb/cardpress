import type { Draft } from "./draft";

/**
 * Why an item cannot be changed, or null when it can. A post waiting to be sent, and anything published (sent, or with a
 * live public page), stays as it is until it is brought back to draft. The server refuses the same changes.
 */
export function lockReason(d?: Pick<Draft, "status" | "pageAt" | "kind"> | null): string | null {
  if (!d) return null;
  if (d.status === "scheduled") return "A post is waiting to be sent. Cancel it in the queue to edit.";
  if (d.status === "published" || d.pageAt) return `This ${d.kind} is published. Bring it back to draft to edit.`;
  return null;
}
