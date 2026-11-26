import { withFooterFlags } from "./cardDesign";
/** The assistant's options and what a reply changed: what the chat shows for them, and the preview of a picked option. */

import type { Change, Choice, Conversation } from "./chat";
import type { Draft } from "./draft";
import type { Design } from "./types";

/** The option picked on screen and not saved yet, by offer. */
export type Picks = Record<string, number>;

/** Up to this many options are radio buttons; more become a drop-down. */
export const AS_RADIOS = 4;

const LABEL: Record<string, string> = {
  headline: "Card headline", eyebrow: "Eyebrow", subtitle: "Subtitle", tag: "Tag",
  footer: "Footer, right", footerLeft: "Footer, left", quoteAuthor: "Quote author", statValue: "Number",
  title: "Title", altText: "Alt text", hashtags: "Hashtags", summary: "Summary",
};
export const choiceLabel = (field: string) => LABEL[field] ?? field;

/** What an option says. An empty one takes the words off the card. */
export const optionText = (v: string | string[]) => (Array.isArray(v) ? v.map((t) => `#${t}`).join(" ") : v || "None");

/** An offer that can still be picked from. */
export const open = (c: Choice) => c.status === "pending" || c.status === "chosen";

/** The option shown as selected: the one picked on screen, else the saved one, else the recommended first. */
export const selected = (c: Choice, picks: Picks) => picks[c.id] ?? (c.chosen >= 0 ? c.chosen : 0);

/** What one reply left to look at: its changes and the options it offered. */
export function ofReply(conv: Conversation, messageId: string): { changes: Change[]; choices: Choice[] } {
  return {
    changes: (conv.changes ?? []).filter((c) => c.messageId === messageId),
    choices: (conv.choices ?? []).filter((c) => c.messageId === messageId && open(c)),
  };
}

/** The offers picked on screen for one reply, as they are sent. */
export const picked = (choices: Choice[], picks: Picks) =>
  choices.filter((c) => picks[c.id] !== undefined).map((c) => ({ choiceId: c.id, option: picks[c.id] }));

const CARD: Record<string, keyof Design> = {
  headline: "title", eyebrow: "eyebrow", subtitle: "subtitle", tag: "tag",
  footer: "footer", footerLeft: "footerLeft", quoteAuthor: "quoteAuthor", statValue: "statValue",
};

/**
 * A draft as it would look with the picked options, for the screen only: nothing of this is saved. `card` is the card
 * the item is shown with, for an item that has none of its own.
 */
export function preview(d: Draft, card: Design, choices: Choice[], picks: Picks): { draft: Draft; design: Design; on: boolean } {
  let draft = d, design = card, on = false;
  for (const c of choices) {
    const i = picks[c.id];
    if (c.draftId !== d.id || !open(c) || i === undefined || !c.options[i]) continue;
    const value = c.options[i].value;
    const key = CARD[c.field];
    if (key) {
      const next = { ...design, ...withFooterFlags({ [key]: value } as Partial<Design>) };
      if ((design[key] ?? "") === value && next.noFooter === design.noFooter && next.noFooterLeft === design.noFooterLeft) continue;
      design = next;
      draft = { ...draft, design };
    } else {
      if (JSON.stringify(draft[c.field as keyof Draft]) === JSON.stringify(value)) continue;
      draft = { ...draft, [c.field]: value };
    }
    on = true;
  }
  return { draft, design, on };
}
