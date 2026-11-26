# Content fields: one schema for the studio and the agents

**Status:** revised 2026-11-25: the owner asked for strongly typed models (Zod or Pydantic) rather than a hand-written schema. Specification only: nothing is built.

## Why
The same facts about a post or article are written down in several places: database columns, server checks, tool descriptions, agent skills and grading rubrics. They already disagree:

| Field | Server allows | Skill or rubric says |
|---|---|---|
| Name `title` | the item's title (`drafts.title`) and, separately, the card headline (`design.title`) | one `title` for "the headline on the card image and the article's title" |
| Article summary | 300 characters | under 160 |
| Hashtags | 30 | 0 to 5 |
| Article body | 100,000 characters | 20,000 |

The person also cannot see these fields together: who may change them, what is missing, and what approval needs.

## What changes
- The agent project owns the **typed models** (Zod) of a post, an article, their card words and governing fields, taken from the database: each field's type, limit, who sets it and what needs it. JSON Schema is generated from them (`schema/out/content.schema.json`), and so are the tool inputs and the rubric limit lines.
- The skills and rubrics read their limits from that file instead of repeating them.
- The manifest carries the schema (manifest and contract version 6). CardPress validates against it, builds the Details form from the same models, and refuses a schema naming a field it does not have.
- The card headline is called `headline` everywhere an agent or a person sees it, so it is no longer confused with `title`.

## Rules that stay
- The server's own checks are the limit. The schema may be stricter (writing standards), never looser.
- Look, status, approval and publishing are never set by an agent.

## New fields
Audience, topic, campaign and review notes become columns of a draft (see `design.md`).

## Out of scope
Fields beyond those four.
