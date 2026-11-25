# Contract between CardPress and social-card-agent

The only things the two repositories share. This file is authoritative; `social-card-agent` keeps a copy in
`openspec/changes/2026-11-26-studio-contract/contract.md`. Change it here first, then copy it.

Version 2.

## 1. MCP tools

A draft is one post or one article. Each draft has its own card design, text and `revision` (a counter that moves on every change).
Tools that work on a draft take `draftId`; the brand is found from the draft and checked against the caller.

| Tool | Input | Result | Needs |
|---|---|---|---|
| `list_profiles` | | brands | read |
| `list_design_presets` | `profileId` | layouts, backgrounds, sizes, colour sets, font roles, fonts | read |
| `list_drafts` | `profileId` | drafts with a preview | read |
| `get_draft` | `id` | kind, status, revision, `title`, `body`, `summary`, `slug`, `hashtags`, `altText`, `unicodeStyles`, `attachment`, `videoUrl`, `hasPictures` | read |
| `get_design` | `draftId` | `design`, `revision`. Images are reported as present or absent, never as bytes | read |
| `list_connections` | `profileId` | each network: connected, can be posted to | read |
| `list_memories` | `profileId` | notes | read |
| `list_jobs`, `get_job` | as today | | read |
| `fetch_source` | `url` | readable text, marked untrusted | read |
| `create_draft` | `profileId`, `kind` | `draftId`, `revision`. Starts with the brand's design | write |
| `update_draft` | `draftId`, `revision?`, any of `body`, `title`, `summary`, `slug`, `hashtags`, `altText`, `unicodeStyles` | the draft. Only named fields change. `revision` is required with `body` | write |
| `update_design` | `draftId`, `changes` | the whole design and `revision`. Only named fields change | write |
| `set_attachment` | `draftId`, `type` (`card` or `video`), `videoUrl?`, `title?` | the draft | write |
| `save_memory` | `profileId`, `key`, `content` | the note | write |
| `delete_memory` | `profileId`, `key` | | write |
| `propose_content`, `get_proposal` | as today | for outside agents that should not write | write / read |
| `publish_post` | `draftId`, `network` | the job | key scope `agent` |

`update_design.changes` fields: `sizeId`, `layout`, `background`, `paletteId`, `seed`, `eyebrow`, `title`, `subtitle`, `footer`,
`footerLeft`, `tag`, `quoteAuthor`, `statValue`, `titleScale`, `intensity`, `bottomFade`, `showLogo`, `showFooter`,
`fonts` (role to family; an empty family clears the role). `photos`, `screenshot` and `bgImage` are refused.

Two different titles: `update_draft.title` is the item's name (and an article's headline); `update_design.changes.title` is the headline drawn on the card.

Refusals the agent must expect, each with a message to repeat to the person:

- the draft has a post waiting to be sent;
- `revision` is old (read again, then retry once);
- `body` on an article that contains pictures (they would be lost);
- a value the brand cannot use;
- `publish_post`: card image not ready, network not connected, daily limit reached.

A change to an approved or published draft returns it to draft, and takes an article's public page offline. The result says so
(`returnedToDraft`, `pageTakenOffline`), and the agent tells the person.

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
<card draftId="…" revision="12">{ every update_design field; photos, screenshot, bgImage as true or false }</card>
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
| `changes` | when the person changed a draft since the agent last saw it. Design fields carry the new value; text fields say `changed` |
| `source` | once, with the message the person added it to |

- `viewing` is the item on screen. An instruction that names neither item applies to it.
- `write` is what the person ticked for this turn.
- Inside sources and notes, CardPress escapes the opening and closing forms of every block name above.

## 3. Outcomes

- The first draft **of each kind**, when the person ticked it, is sent as `user.define_outcome` with that kind's rubric from the manifest (`max_iterations` 3). The message above is the start of its `description`, followed by the manifest's description for the kind.
- One outcome runs at a time. When both are ticked, CardPress sends the post, waits for it to end, then sends the article.
- Everything else is `user.message`.
- The agent writes the record it stored to `/mnt/session/outputs/post.json` or `/mnt/session/outputs/article.json`. A rubric reads its own file, with the whole body in it.

## 4. Manifest

As built by `scripts/build-manifest.sh`: `version` (2), `agent_id`, `agent_version`, `environment_id`, `vault_id`,
`mcp_server_url`, `confirm_tools`, `outcomes.post`, `outcomes.article` (`description`, `rubric`, `max_iterations`).
CardPress refuses a manifest whose `version` it does not know.
