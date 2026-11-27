/** What the Details form shows: its groups, each field's limits from the content schema, and what is missing. */

import schema from "./content/content.schema.json";
import type { Draft, DraftKind } from "./draft";

export type FieldName = keyof typeof schema.properties;
export type GroupId = "writing" | "card" | "sharing" | "planning";

export const GROUPS: readonly { id: GroupId; title: string; fields: readonly FieldName[] }[] = [
  { id: "writing", title: "Writing", fields: ["kind", "title", "body", "summary"] },
  { id: "card", title: "Card words", fields: ["tag", "eyebrow", "statValue", "headline", "subtitle", "quoteAuthor", "signature", "footerLeft", "footer"] },
  { id: "sharing", title: "Sharing", fields: ["hashtags", "attachment", "altText", "unicodeStyles", "slug"] },
  { id: "planning", title: "Planning", fields: ["audience", "topic", "campaign", "reviewNotes"] },
];

/** Set by the studio's actions (approve, schedule) rather than typed into the form. */
export const BY_ACTION: readonly FieldName[] = ["status", "scheduledAt", "timezone"];

interface Standard { minLength?: number; maxLength?: number; minWords?: number; maxWords?: number; minItems?: number; maxItems?: number }
interface Property {
  "x-label": string; "x-writer": string; "x-kinds": string[];
  "x-standard"?: Partial<Record<DraftKind, Standard>>;
  "x-hardMaxLength"?: Partial<Record<DraftKind, number>>;
  maxLength?: number; maxItems?: number;
}
const prop = (name: FieldName) => (schema.properties as unknown as Record<FieldName, Property>)[name];

export const labelOfField = (name: FieldName) => prop(name)["x-label"];
export const appliesTo = (name: FieldName, kind: DraftKind) => prop(name)["x-kinds"].includes(kind);
export const maxOf = (name: FieldName, kind: DraftKind): number | undefined => prop(name)["x-hardMaxLength"]?.[kind] ?? prop(name).maxLength;
export const maxItemsOf = (name: FieldName) => prop(name).maxItems;

export const countOfWords = (s: string) => s.split(/\s+/u).filter(Boolean).length;
const n = (v: number) => v.toLocaleString("en");
const range = (lo?: number, hi?: number) => (lo !== undefined && hi !== undefined ? `${n(lo)}–${n(hi)}` : hi !== undefined ? `up to ${n(hi)}` : `${n(lo ?? 0)} or more`);

export interface Counter {
  /** "42/200", with the writing standard when there is one: "620 · aim 600–1,300". */
  text: string;
  /** "over" is past the server's limit; "aside" is outside the writing standard, which nothing enforces. */
  state: "ok" | "aside" | "over";
}

/** The counter under a field. A text is counted in characters, or words where the standard is in words; a list by its items. */
export function counter(name: FieldName, kind: DraftKind, value: string | readonly string[]): Counter {
  const standard = prop(name)["x-standard"]?.[kind];
  const list = typeof value !== "string";
  const length = list ? value.length : [...value].length;
  const max = list ? maxItemsOf(name) : maxOf(name, kind);
  const over = max !== undefined && length > max;
  if (!standard) return { text: max === undefined ? n(length) : `${n(length)}/${n(max)}`, state: over ? "over" : "ok" };
  const inWords = standard.minWords !== undefined || standard.maxWords !== undefined;
  const size = inWords ? countOfWords(value as string) : length;
  const [lo, hi] = inWords ? [standard.minWords, standard.maxWords] : list ? [standard.minItems, standard.maxItems] : [standard.minLength, standard.maxLength];
  const aside = length > 0 && ((lo !== undefined && size < lo) || (hi !== undefined && size > hi));
  const shown = inWords ? `${n(size)} ${size === 1 ? "word" : "words"}` : n(size);
  return { text: `${shown} · aim ${range(lo, hi)}`, state: over ? "over" : aside ? "aside" : "ok" };
}

/**
 * What stands between a draft and its approval, by field name: empty text, or text over a limit. The server's answer
 * stays the last word.
 */
export function blockers(d: Pick<Draft, "kind">, text: { value: string; length: number; limit?: number }): { missing: FieldName[]; over: FieldName[] } {
  const missing: FieldName[] = text.value.trim() ? [] : ["body"];
  const limit = text.limit ?? maxOf("body", d.kind);
  return { missing, over: limit !== undefined && text.length > limit ? ["body"] : [] };
}

export function blockerLine({ missing, over }: { missing: FieldName[]; over: FieldName[] }): string {
  const parts = [];
  if (missing.length) parts.push(`${missing.length} missing: ${missing.map(labelOfField).join(", ")}`);
  if (over.length) parts.push(`Over the limit: ${over.map(labelOfField).join(", ")}`);
  return parts.join(" · ");
}

const CARD: Partial<Record<FieldName, string>> = { headline: "title", eyebrow: "eyebrow", subtitle: "subtitle", tag: "tag", footer: "footer", footerLeft: "footerLeft", quoteAuthor: "quoteAuthor", statValue: "statValue", signature: "signature" };
const OWN: Partial<Record<FieldName, (keyof Draft)[]>> = {
  kind: ["kind"], title: ["title"], body: ["doc"], summary: ["summary"], slug: ["slug"], hashtags: ["hashtags"], altText: ["altText"],
  unicodeStyles: ["unicodeStyles"], attachment: ["attachment", "attachmentTitle", "videoUrl", "images"],
  audience: ["audience"], topic: ["topic"], campaign: ["campaign"], reviewNotes: ["reviewNotes"],
};
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? "") === JSON.stringify(b ?? "");

/** The fields that differ between two states of an item, to mark what someone else just changed. */
export function changedFields(was: Draft, now: Draft): FieldName[] {
  const out: FieldName[] = [];
  for (const [name, keys] of Object.entries(OWN) as [FieldName, (keyof Draft)[]][]) {
    if (keys.some((k) => !same(was[k], now[k]))) out.push(name);
  }
  const a = (was.design ?? {}) as unknown as Record<string, unknown>, b = (now.design ?? {}) as unknown as Record<string, unknown>;
  for (const [name, key] of Object.entries(CARD) as [FieldName, string][]) {
    if (was.design && !same(a[key], b[key])) out.push(name);
  }
  return out;
}
