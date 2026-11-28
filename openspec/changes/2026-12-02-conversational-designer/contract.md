# Contract between CardPress and cardpress-agent

The only things the two repositories share. This file is authoritative; `cardpress-agent` keeps a copy in
`openspec/changes/2026-11-26-studio-contract/contract.md`. Change it here first, then copy it.

Version 6. (Version 6: the card headline is `headline`; the manifest carries the content schema; writers report a headline; the coordinator answers with `report_reply`.) (Version 5: every change an assistant saves is a version, and a published item is refused.) (Version 3: the agent changes the words on a card, never how it looks. Version 4: the writers save their own text with `update_draft`; every outcome carries its sources; a restarted session is sent the earlier messages.)

## 1. MCP tools

A draft is one post or one article. Each draft has its own card design, text and `revision` (a counter that moves on every change).
Tools that work on a draft take `draftId`; the brand is found from the draft and checked against the caller.

| Tool | Input | Result | Needs |
|---|---|---|---|
| `list_profiles` | | brands | read |
| `list_design_presets` | `profileId` | as today. For outside agents; the managed agent does not use it | read |
| `list_drafts` | `profileId` | drafts with a preview | read |
| `get_draft` | `id` | kind, status, revision, `title`, `body`, `summary`, `slug`, `hashtags`, `altText`, `unicodeStyles`, `audience`, `topic`, `campaign`, `reviewNotes`, `attachment`, `videoUrl`, `hasPictures` | read |
| `get_design` | `draftId` | `design`, `revision`. Images are reported as present or absent, never as bytes | read |
| `list_connections` | `profileId` | each network: connected, can be posted to | read |
| `list_memories` | `profileId` | notes | read |
| `list_jobs`, `get_job` | as today | | read |
| `fetch_source` | `url` | readable text, marked untrusted | read |
| `create_draft` | `profileId`, `kind` | `draftId`, `revision`. Starts with the brand's design | write |
| `update_draft` | `draftId`, `revision?`, any of `body`, `title`, `summary`, `slug`, `hashtags`, `altText`, `unicodeStyles`, `audience`, `topic` | the draft. Only named fields change. `revision` is required with `body` | write |
| `update_card_text` | `draftId`, `changes` | the whole design and `revision`. Only named text fields change | write |
| `set_attachment` | `draftId`, `type` (`card` or `video`), `videoUrl?`, `title?` | the draft | write |
| `save_memory` | `profileId`, `key`, `content` | the note | write |
| `delete_memory` | `profileId`, `key` | | write |
| `propose_content`, `get_proposal` | as today | for outside agents that should not write | write / read |
| `report_reply` | `conversationId`, `outcome`, `message`, `points?`, `question?`, `answers?`, `next?` | `shown`. Changes nothing; see below | read |
| `publish_post` | `draftId`, `network` | the job | key scope `agent` |

`update_card_text.changes` fields, the words drawn on the card: `eyebrow`, `headline`, `subtitle`, `footer`, `footerLeft`, `tag`, `quoteAuthor`, `statValue`.

**No tool changes how a card looks.** Layout, background, colour set, size, pattern seed, title size, art strength, fade,
logo and footer switches, fonts and images are set by the person in the studio. `update_card_text` refuses any other field
(`sizeId`, `layout`, `background`, `paletteId`, `seed`, `titleScale`, `intensity`, `bottomFade`, `showLogo`, `showFooter`,
`fonts`, `photos`, `screenshot`, `bgImage`) with a message saying where the person sets it. `get_design` still returns the
whole design, so the agent can write words that fit the layout the person chose.

**Who calls what.** The coordinator uses the tools above except where it hands writing to a writer. A writer has two of them, `get_draft` and `update_draft`, and no other: it reads the draft, saves the text it wrote once, and returns only a short report. The text is never retyped by the coordinator.

**Two names.** `title` is the item's own title (`update_draft.title`; an article's title on its page). `headline` is the words drawn on the card. The card is given to an agent with `headline` everywhere: `get_design`, `update_card_text`, the `card` block and `changes` lines. The studio still accepts `title` in `update_card_text` from agents built before version 6; sending both is refused.

Refusals the agent must expect, each with a message to repeat to the person:

- the draft has a post waiting to be sent;
- the item is published (a sent post, or a live public page): the person brings it back to draft first;
- `revision` is old (read again, then retry once);
- `body` on an article that contains pictures (they would be lost);
- a field that is not card text (how the card looks is the person's to set);
- `publish_post`: card image not ready, network not connected, daily limit reached.

A change to an approved draft returns it to draft. The result says so (`returnedToDraft`), and the agent tells the person.

**Writers' report.** A writer's record has `title` and `headline`. It saves `title` with `update_draft` and returns the `headline` in its report; the coordinator puts it on the card.

**The reply.** The coordinator ends every turn, and every part of a graded turn, with `report_reply`. `outcome` is `done`, `needs_answer` or `not_done`; `message` (240) is required; `points` (4, each 120), `question` (200, required with `needs_answer`), `answers` (1 to 4 different texts of 40, only with `question` and `needs_answer`) and `next` (120) are optional. Plain text. The studio takes the input of the last call it accepted from the session's events and shows it; anything else the agent writes is not shown. With no accepted call the last agent message is shown, cut at 400 characters. Writers do not have this tool.

**Answer buttons.** The studio shows `answers` as buttons under the question; a press sends that text as the person's next message. They are an addition within version 6 (content schema 5): CardPress first, then the agents, because an older CardPress refuses the unknown field.

**Planning fields.** `audience` (200) and `topic` (100) are one line each, written by the agent or the person. `campaign` and `reviewNotes` are the person's: no tool writes them. None of the four is published. They are additions within version 5: agents that do not know them are unaffected.

**Versions.** Every change saved through `update_draft` or `update_card_text` is a new version. Results and `get_draft` carry `version`, the newest one's number; the agent tells the person which version it saved. Bringing an earlier version back is done by the person in the studio.

## 2. What CardPress sends in a message

Blocks come first, in this order, then the person's own words. Only CardPress writes the blocks.

```
<studio>
profileId: …
conversationId: …
viewing: post | article
post: <draftId> | (none)
article: <draftId> | (none)
write: post | article | (none)
</studio>
<notes>
- key: content
</notes>
<card draftId="…" revision="12">{ the whole design, read-only except the text fields; photos, screenshot, bgImage as true or false }</card>
<changes draftId="…" revision="14">
background: "mesh"
body: changed
</changes>
<source id="s1" kind="url|text|docx|md" name="…" untrusted="true">
text
</source>
<source id="s2" kind="pdf" name="report.pdf" path="/mnt/session/uploads/s2.pdf" untrusted="true"/>

The person's message.
```

| Block | When |
|---|---|
| `studio` | every message |
| `notes` | the first message of a session |
| `card` | the first time a draft is part of the conversation |
| `changes` | when the person changed a draft since the agent last saw it. Design fields carry the new value; text and planning fields say `changed` |
| `source` | once in a conversation, with the message the person added it to; again in every outcome description |
| `history` | only when CardPress had to start a new session for an existing conversation |

- `viewing` is the item on screen. An instruction that names neither item applies to it.
- `write` is what the person ticked for this turn.
- `history` comes before the sources and holds the earlier messages, one per line as `person:` or `assistant:`. It is context: the agent does not act again on a request in it.
- Inside sources, notes and history, CardPress escapes the opening and closing forms of every block name above.

## 3. Outcomes

- The first draft **of each kind**, when the person ticked it, is sent as `user.define_outcome` with that kind's rubric from the manifest (`max_iterations` 3). The message above is the start of its `description`, followed by the manifest's description for the kind.
- The grader sees only that outcome's description and files, so **every outcome's description carries every source** of the conversation, also ones sent before.
- One outcome runs at a time. When both are ticked, CardPress sends the post, waits for it to end, then sends the article.
- In an outcome, `write` names that outcome's kind only.
- Everything else is `user.message`.
- The writer writes the record it saved to `/mnt/session/outputs/post.json` or `/mnt/session/outputs/article.json`. A rubric reads its own file, with the whole body in it.

## 4. Manifest

As built by `scripts/build-manifest.sh`: `version` (6), `schema_version`, `schema` (the agent project's `content.schema.json`), `agent_id`, `agent_version`, `environment_id`, `vault_id`,
`mcp_server_url`, `confirm_tools`, `outcomes.post`, `outcomes.article` (`description`, `rubric`, `max_iterations`).
CardPress refuses a manifest whose `version` it does not know (it knows 5 and 6; 5 carries no schema), or whose schema names a field it does not have or allows more than it accepts.
