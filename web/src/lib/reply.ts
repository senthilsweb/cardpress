/** The short lines of a reply card, and the list of conversations as it grows. */

import type { ChatMessage, Conversation, ReplyCheck, ReplyDetail, SavedVersion } from "./chat";

const KIND = { post: "Post", article: "Article" } as const;

export const savedLine = (s: SavedVersion) => `Saved: ${KIND[s.kind]} v${s.version}`;

export function checkLine(c: ReplyCheck): string {
  if (!c.passed) return `${KIND[c.kind]} check not passed.`;
  return c.round && c.round > 1 ? `${KIND[c.kind]} check passed (round ${c.round}).` : `${KIND[c.kind]} check passed.`;
}

/** Whether a reply has anything to put on a card under its words. */
export const hasOutcome = (d?: ReplyDetail) => !!(d?.saved?.some((s) => s.version) || d?.checks?.length || d?.steps?.length);

/**
 * The answer already given to a reply's question: the person's next message, when it is one of the buttons. Typed words
 * count as much as a press.
 */
export function answered(messages: ChatMessage[], at: number, answers: string[]): string | undefined {
  const next = messages[at + 1];
  if (next?.role !== "user") return undefined;
  const said = next.content.trim().toLowerCase();
  return answers.find((a) => a.toLowerCase() === said);
}

/** The newest conversations followed by older ones loaded since, each once, as the newest list has it. */
export function withOlder(recent: Conversation[], older: Conversation[]): Conversation[] {
  const have = new Set(recent.map((c) => c.id));
  return [...recent, ...older.filter((c) => !have.has(c.id))];
}

/** How many the server lists at once: a list this long may have more after it. */
export const PAGE = 100;
