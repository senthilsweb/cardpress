# Design

## The fields
Writer: **A** the agent may write it (and the person), **P** only the person, **S** set by the system.
"Hard" is the server's limit; "Standard" is the writing standard the skills and rubrics use.

| Field | Column | Post | Article | Writer | Hard | Standard | Needed to | Choices |
|---|---|---|---|---|---|---|---|---|
| title | `drafts.title` | name | headline | A | 200 | article 4–12 words | publish a page | yes |
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

## The file
JSON Schema 2020-12. One object with a property per field and these extra keys: `x-column`, `x-writer` (`agent`, `person`, `system`), `x-kinds`, `x-standard` (per kind), `x-requiredFor`, `x-choices`, `x-label`. A first draft of it is in the agent project, in the matching change folder.

## How each side uses it
| Where | Use |
|---|---|
| Skills | A copy is placed beside each `SKILL.md` by a script, which fails when a copy is stale. The skill says "limits are in `content.schema.json`" and keeps only voice and structure |
| Rubrics | Generated lines for length and presence, hand-written lines for quality |
| Manifest | `schema` and `schema_version` |
| CardPress | Renders the Details panel (labels, counters, missing items); checks that each field exists and no standard exceeds the hard limit. Without an assistant it uses a built-in copy |

## New fields (confirmed by the owner)
| Field | New column | Writer | Hard | Notes |
|---|---|---|---|---|
| audience | `drafts.audience` | A and P | 200 | who it is for; the writers use it |
| topic | `drafts.topic` | A and P | 100 | for finding and grouping |
| campaign | `drafts.campaign` | P | 100 | |
| reviewNotes | `drafts.review_notes` | P (approvers) | 2,000 | never published; the writers read it on a revision |

None is required to approve. Who writes each is a proposal to confirm.
