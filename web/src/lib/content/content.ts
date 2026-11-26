// The content of a CardPress post or article and the facts that govern it, described once. The JSON Schema, the tool
// inputs and the rubric limit lines are generated from this file (`npm run schema`), and CardPress keeps a copy of all
// of them. Change it here, never in a generated file or a copy.
//
// A model is the server's hard limit. A `…Standard` model is the writing standard, which may only be stricter.

import { z } from "zod";

/** Moves when a field, a limit or a tool input changes. */
export const SCHEMA_VERSION = 2;

export type Writer = "agent" | "person" | "system";
export type Kind = "post" | "article";
export type Need = "approve" | "publishPage" | "send" | "schedule";

/** The writing standard of one field, for one kind. Words and sentences cannot be said in JSON Schema's own keys. */
export interface Standard {
  minLength?: number;
  maxLength?: number;
  minWords?: number;
  maxWords?: number;
  minItems?: number;
  maxItems?: number;
}

export interface FieldMeta {
  label: string;
  /** Where CardPress keeps it: "drafts.<column>", "drafts.design.<field>", or another table's column. */
  column: string;
  writer: Writer;
  kinds: Kind[];
  requiredFor?: Need[];
  standard?: Partial<Record<Kind, Standard>>;
  /** The server's limit where it differs by kind. */
  hardMaxLength?: Partial<Record<Kind, number>>;
  /** An assistant offers several to choose from. */
  choices?: boolean;
  /** Part of the text a published item is searched by. */
  embed?: boolean;
}

const both: Kind[] = ["post", "article"];

/** Metadata is kept under `x-…` keys, which is how it appears in the JSON Schema. */
function field<T extends z.ZodType>(type: T, m: FieldMeta): T {
  const meta = Object.fromEntries(Object.entries(m).map(([k, v]) => [`x-${k}`, v]));
  return type.meta(meta) as T;
}

/** The metadata of a field made with `field`. */
export function metaOf(type: z.ZodType): FieldMeta {
  const all = (type.meta() ?? (type instanceof z.ZodOptional ? (type.unwrap() as z.ZodType).meta() : undefined)) ?? {};
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k.replace(/^x-/, ""), v])) as unknown as FieldMeta;
}

/* ------------------------------------------------------------------ the words on the card */

const word = (name: string, label: string, max: number, more: Partial<FieldMeta> = {}) =>
  field(z.string().max(max), { label, column: `drafts.design.${name}`, writer: "agent", kinds: both, ...more });

export const CardText = z.strictObject({
  headline: word("title", "Headline", 400, { standard: { post: { minWords: 3, maxWords: 9 }, article: { minWords: 3, maxWords: 9 } }, choices: true, embed: true }),
  eyebrow: word("eyebrow", "Eyebrow", 200, { choices: true }),
  subtitle: word("subtitle", "Subtitle", 600, { choices: true }),
  tag: word("tag", "Tag", 100, { choices: true }),
  footer: word("footer", "Footer", 200),
  footerLeft: word("footerLeft", "Footer, left", 200),
  quoteAuthor: word("quoteAuthor", "Quote author", 200),
  statValue: word("statValue", "Number", 60),
});

/* ------------------------------------------------------------------ the writing */

/** A hashtag without its "#": letters of any alphabet, digits and underscores. */
export const Hashtag = z.string().max(100).regex(/^[\p{L}\p{N}_]+$/u);

const title = field(z.string().max(200), { label: "Title", column: "drafts.title", writer: "agent", kinds: both, requiredFor: ["publishPage"], standard: { article: { minWords: 4, maxWords: 12 } }, choices: true, embed: true });
const altText = field(z.string().max(1000), { label: "Alt text", column: "drafts.alt_text", writer: "agent", kinds: both, choices: true });
const hashtags = field(z.array(Hashtag).max(30), { label: "Hashtags", column: "drafts.hashtags", writer: "agent", kinds: ["post"], standard: { post: { minItems: 3, maxItems: 5 } }, choices: true, embed: true });
const summary = field(z.string().max(300), { label: "Summary", column: "drafts.summary", writer: "agent", kinds: ["article"], standard: { article: { maxLength: 160 } }, choices: true, embed: true });
const slug = field(z.string().max(80).regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/), { label: "Address", column: "drafts.slug", writer: "agent", kinds: ["article"], requiredFor: ["publishPage"] });
const unicodeStyles = field(z.boolean(), { label: "Unicode styles", column: "drafts.unicode_styles", writer: "agent", kinds: ["post"] });
const attachment = field(z.enum(["card", "image", "images", "document", "video"]), { label: "Attachment", column: "drafts.attachment_kind", writer: "agent", kinds: ["post"], requiredFor: ["send"] });

const body = (kinds: Kind[], max: number, standard: Standard) =>
  field(z.string().max(max), { label: "Body", column: "drafts.doc", writer: "agent", kinds, requiredFor: ["approve"], standard: { [kinds[0]]: standard }, embed: true });

export const postBody = body(["post"], 3000, { minLength: 600, maxLength: 1300 });
export const articleBody = body(["article"], 100_000, { minWords: 600, maxWords: 1500 });

/* ------------------------------------------------------------------ planning and the record */

const kind = <K extends Kind>(k: K) => field(z.literal(k), { label: "Type", column: "drafts.kind", writer: "person", kinds: both });
const stamp = (label: string, column: string) => field(z.string(), { label, column, writer: "system", kinds: both }).optional();

export const Planning = z.strictObject({
  audience: field(z.string().max(200), { label: "Audience", column: "drafts.audience", writer: "agent", kinds: both, embed: true }),
  topic: field(z.string().max(100), { label: "Topic", column: "drafts.topic", writer: "agent", kinds: both, embed: true }),
  campaign: field(z.string().max(100), { label: "Campaign", column: "drafts.campaign", writer: "person", kinds: both }),
  reviewNotes: field(z.string().max(2000), { label: "Review notes", column: "drafts.review_notes", writer: "person", kinds: both }),
});

const Record = z.strictObject({
  status: field(z.enum(["draft", "approved", "scheduled", "published"]), { label: "Status", column: "drafts.status", writer: "person", kinds: both }),
  scheduledAt: field(z.string(), { label: "Planned date", column: "drafts.scheduled_at", writer: "person", kinds: both, requiredFor: ["schedule"] }).optional(),
  timezone: field(z.string(), { label: "Time zone", column: "drafts.timezone", writer: "person", kinds: both }).optional(),
  revision: field(z.int(), { label: "Revision", column: "drafts.revision", writer: "system", kinds: both }),
  version: field(z.int(), { label: "Version", column: "draft_versions.seq", writer: "system", kinds: both }),
  createdBy: stamp("Created by", "drafts.created_by"),
  approvedBy: stamp("Approved by", "drafts.approved_by"),
  approvedAt: stamp("Approved at", "drafts.approved_at"),
  pageAt: stamp("Published at", "drafts.page_at"),
});

const governing = { ...Planning.partial().shape, ...Record.shape };

export const Post = z.strictObject({ kind: kind("post"), title, body: postBody, hashtags, altText, unicodeStyles, attachment, card: CardText.partial(), ...governing });
export const Article = z.strictObject({ kind: kind("article"), title, body: articleBody, summary, slug, altText, card: CardText.partial(), ...governing });
export const Content = z.discriminatedUnion("kind", [Post, Article]);

export type Post = z.infer<typeof Post>;
export type Article = z.infer<typeof Article>;
export type Content = z.infer<typeof Content>;
export type CardText = z.infer<typeof CardText>;
export type Planning = z.infer<typeof Planning>;

/* ------------------------------------------------------------------ the writing standard */

/** How many words a text holds. */
export const words = (s: string) => s.split(/\s+/u).filter(Boolean).length;

/** The field with its standard for one kind added: the same hard limit, then the stricter checks. */
function held(type: z.ZodType, k: Kind): z.ZodType {
  const s = metaOf(type).standard?.[k];
  if (!s) return type;
  let t: any = type;
  if (s.minLength !== undefined) t = t.min(s.minLength);
  if (s.maxLength !== undefined) t = t.max(s.maxLength);
  if (s.minItems !== undefined) t = t.min(s.minItems);
  if (s.maxItems !== undefined) t = t.max(s.maxItems);
  if (s.minWords !== undefined) t = t.refine((v: string) => words(v) >= s.minWords!, `at least ${s.minWords} words`);
  if (s.maxWords !== undefined) t = t.refine((v: string) => words(v) <= s.maxWords!, `at most ${s.maxWords} words`);
  return t;
}

const cardStandard = (k: Kind) => z.strictObject({ ...CardText.shape, headline: held(CardText.shape.headline, k) }).partial();

export const PostStandard = Post.extend({ body: held(postBody, "post"), hashtags: held(hashtags, "post"), card: cardStandard("post") });
export const ArticleStandard = Article.extend({ title: held(title, "article"), body: held(articleBody, "article"), summary: held(summary, "article"), card: cardStandard("article") });

/* ------------------------------------------------------------------ what the studio's tools take */

const draftId = z.string();

/** `update_draft`: only the named fields change. `revision` is required with `body`. */
export const UpdateDraftInput = z.strictObject({
  draftId,
  revision: z.int().optional(),
  body: articleBody.optional(),
  title: title.optional(),
  summary: summary.optional(),
  slug: slug.optional(),
  hashtags: hashtags.optional(),
  altText: altText.optional(),
  unicodeStyles: unicodeStyles.optional(),
  audience: Planning.shape.audience.optional(),
  topic: Planning.shape.topic.optional(),
});

export const UpdateCardTextInput = z.strictObject({ draftId, changes: CardText.partial() });

export const Tools = { update_draft: UpdateDraftInput, update_card_text: UpdateCardTextInput };
