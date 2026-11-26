# Design

## The fields
Writer: **A** the agent may write it (and the person), **P** only the person, **S** set by the system.
"Hard" is the server's limit; "Standard" is the writing standard the skills and rubrics use.

| Field | Column | Post | Article | Writer | Hard | Standard | Needed to | Choices |
|---|---|---|---|---|---|---|---|---|
| title | `drafts.title` | name | headline | A | 200 | article 4–12 words | publish a page | articles |
| body | `drafts.doc` | yes | yes | A | 3,000 / 100,000 | 600–1,300 / 600–1,500 words | approve | no |
| hashtags | `drafts.hashtags` | yes | no | A | 30 | 3–5 | | yes (sets) |
| summary | `drafts.summary` | no | yes | A | 300 | under 160 | | yes |
| slug | `drafts.slug` | no | yes | A | 80, `a-z0-9-` | | publish a page | no |
| altText | `drafts.alt_text` | yes | yes | A | 1,000 | one sentence | | yes |
| headline | `design.title` | yes | yes | A | 400 | 3–9 words | | yes |
| eyebrow | `design.eyebrow` | yes | yes | A | 200 | | | yes |
| subtitle | `design.subtitle` | yes | yes | A | 600 | | | yes |
| tag | `design.tag` | yes | yes | A | 100 | | | yes |
| footer, footerLeft | `design.footer…` | yes | yes | A | 200 | empty = brand's | | no |
| quoteAuthor, statValue | `design.…` | yes | yes | A | 200 / 60 | | | no |
| kind | `drafts.kind` | yes | yes | P | post, article | | | |
| attachment, title, video | `drafts.attachment…` | yes | no | A for video and card, P for files | | | send | |
| unicodeStyles | `drafts.unicode_styles` | yes | no | A | on, off | | | |
| status | `drafts.status` | yes | yes | P | draft, approved, scheduled, published | | | |
| planned date, time zone | `drafts.scheduled_at`, `publish_jobs` | job | plan | P | within 366 days | | schedule | |
| revision, version | system | yes | yes | S | | | | |
| created by, approved by, approved at | system | yes | yes | S | | | | |
| published at, page, post link | system | yes | yes | S | | | | |

The standard column starts from today's rubrics. The owner's `house-style.md` changes it in one place.

## Typed models, not a hand-written file
The governing fields are **typed models** in the agent project, written in **Zod** (TypeScript). The JSON Schema is generated from them and is never edited by hand.

Why Zod rather than Pydantic:
- The agents cannot run code. Their environment has no shell and no outside network, so the models are used at build and test time and by CardPress, not inside a session. The model language therefore only has to suit those two places.
- CardPress's screens are TypeScript. The same models check the Details form in the browser, with no second copy of the rules.
- Zod 4 writes JSON Schema 2020-12 (`z.toJSONSchema`) including the extra keys from `.meta()`. That one output feeds the Go server, the MCP tool definitions and the manifest.
- Pydantic would add a Python toolchain to both projects for the same result. If the owner prefers it, the plan is the same with `model_json_schema()` in place of `z.toJSONSchema`.

```ts
// schema/content.ts (agent project) — a sketch
const Writer = z.enum(["agent", "person", "system"]);
const field = <T extends z.ZodTypeAny>(t: T, m: FieldMeta) => t.meta(m);

export const CardText = z.object({
  headline: field(z.string().max(400), { column: "design.title", writer: "agent", standard: { words: [3, 9] }, choices: true, embed: true }),
  eyebrow:  field(z.string().max(200), { column: "design.eyebrow", writer: "agent", choices: true }),
  // subtitle, tag, footer, footerLeft, quoteAuthor, statValue …
});

const Governing = z.object({
  status:      field(z.enum(["draft", "approved", "scheduled", "published"]), { column: "drafts.status", writer: "person" }),
  audience:    field(z.string().max(200).optional(), { column: "drafts.audience", writer: "agent", embed: true }),
  topic:       field(z.string().max(100).optional(), { column: "drafts.topic", writer: "agent", embed: true }),
  campaign:    field(z.string().max(100).optional(), { column: "drafts.campaign", writer: "person" }),
  reviewNotes: field(z.string().max(2000).optional(), { column: "drafts.review_notes", writer: "person" }),
  // revision, version, createdBy, approvedBy, approvedAt, publishedAt: writer "system"
});

export const Post    = Governing.extend({ kind: z.literal("post"),    title: …, body: z.string().max(3000), hashtags: z.array(Hashtag).max(30), altText: …, card: CardText });
export const Article = Governing.extend({ kind: z.literal("article"), title: …, body: z.string().max(100_000), summary: z.string().max(300), slug: Slug, altText: …, card: CardText });
export const Content = z.discriminatedUnion("kind", [Post, Article]);

// The writing standard is a second, stricter model of the same fields
export const PostStandard    = Post.extend({ body: z.string().min(600).max(1300), hashtags: z.array(Hashtag).min(3).max(5) });
export const ArticleStandard = Article.extend({ summary: z.string().max(160), /* title 4–12 words, body 600–1,500 words */ });

// What the tools take, from the same pieces
export const UpdateDraftInput    = Content.pick(…) /* draftId, revision and the agent-writable fields */;
export const UpdateCardTextInput = z.object({ draftId: z.string(), changes: CardText.partial() });
export const OfferChoicesInput   = /* 2026-12-07-assistant-choices */;
```

Each field's metadata is `column`, `writer`, `kinds`, `requiredFor`, `choices`, `embed` and `label`. A model is the hard limit; its `…Standard` partner is the writing standard. A test fails if a standard is looser than its model.

## What is generated, and who uses it
`npm run schema` in the agent project writes `schema/out/`:

| File | Used by |
|---|---|
| `content.schema.json` (JSON Schema of `Content` and the standards) | the manifest (`schema`, `schema_version`), the skills, CardPress's server |
| `tools.schema.json` (the tool inputs) | CardPress's MCP tool definitions. A Go test fails if the server's tool `inputSchema` differs |
| `rubric-limits.md` | included in `rubrics/post.md` and `article.md`; the quality lines stay hand-written |
| `content.ts` (the models themselves) | copied into the studio's `web/src/lib/content/`, so the Details form validates with the same models |

| Where | Use |
|---|---|
| Skills | A copy of `content.schema.json` is placed beside each `SKILL.md` by the build, and the build fails when a copy is stale. The skill says "the fields and their limits are in `content.schema.json`" and keeps only voice and structure |
| CardPress server | Loads the schema from the manifest, or its built-in copy when no assistant is set up. At start-up it refuses a schema naming a field or column it does not have, or a limit looser than its own |
| CardPress screens | Details groups, labels, counters and "missing" come from the models; the server's answer stays the last word |
| Agents | Read the schema in their skills; their tool calls are checked by CardPress against the same rules |

The studio keeps a copy of the generated files, so it builds and runs without the agent project. A check in each project's CI compares the copy's version with the manifest.

## New fields (confirmed by the owner)
| Field | New column | Writer | Hard | Notes |
|---|---|---|---|---|
| audience | `drafts.audience` | A and P | 200 | who it is for; the writers use it |
| topic | `drafts.topic` | A and P | 100 | for finding and grouping |
| campaign | `drafts.campaign` | P | 100 | |
| reviewNotes | `drafts.review_notes` | P (approvers) | 2,000 | never published; the writers read it on a revision |

None is required to approve. Who writes each is a proposal to confirm.

## As built (studio side, step 4)
- `npm run schema -- --studio <checkout>` writes `internal/content/` (schemas) and `web/src/lib/content/` (models and content schema).
- The tool inputs keep today's names: the card headline is `title` in `update_card_text` until contract 6.
- The tool test compares property names, types and required fields. Descriptions and limits are not compared; the server enforces limits when saving.
- The manifest's `schema` is optional until version 6, and checked when present.
- Planning fields are changed with `PATCH /api/v1/drafts/{id}/planning`. Saving a draft never touches them, an approved item stays approved, and a published or waiting item accepts them from a person. An assistant is still refused on a published or waiting item.
- Review notes need the approve permission. Versions hold audience, topic and campaign, not review notes; a version saved earlier leaves them alone when restored.
- An assistant could save a page address over 80 characters; it is now refused.
- Open for step 7: the post rubric allows no hashtags, while the standard here is 3 to 5.
