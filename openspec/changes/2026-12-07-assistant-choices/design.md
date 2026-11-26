# Design

## The tool
`offer_choices { conversationId, draftId, fields: [ { field, options: [ { value, note? } ], recommended } ] }`

- 2 to 6 options a field, up to 5 fields a call. `value` is text (hashtags: a list). `note` says in a few words how it differs.
- Each value passes the same checks as a write to that field. One bad value refuses the call and says why.
- The draft must belong to the conversation and the caller.
- It changes no draft.

## Why a tool and not a pause
The session could instead stop and wait for an answer. That keeps a request open, needs the person to answer before anything else, and calls the model again to apply the answer. A stored offer is applied by the studio itself: immediate, free and still there tomorrow.

## Storage
Migration `0023`: `choices` (`id`, `conversation_id`, `message_id`, `draft_id`, `field`, `options` JSON, `recommended`, `status` pending | chosen | dismissed | superseded, `chosen`, `created_at`, `decided_at`). A new offer for the same draft and field supersedes the pending one.

## Requests
| Request | Purpose |
|---|---|
| conversation read | includes its choices |
| `POST /api/v1/chat/choices/apply` | `{draftId, revision, picks: [{choiceId, option}]}`: one version, label "chosen". A stale revision is refused, as for any save, so a change made meanwhile is never overwritten |
| `POST /api/v1/chat/choices/{id}/dismiss` | keep what is there |

## On screen
```
Saved the article as version 2.  Article check passed.

Title                                   (recommended is saved)
  (•) How short data contracts stopped our breakages   recommended
  ( ) Eleven broken dashboards, then two               leads with the number
  ( ) The contract that fits on one page

Card headline
  (•) Short data contracts      ( ) From 11 breakages to 2

                                   [ Keep as is ]  [ Use selected ]
```

## Live preview
- Picking a radio button or drop-down value shows it on the canvas immediately: the card for card words, the post or article for text. A banner says "Previewing. Not saved."
- The preview is laid over the draft on screen only. Autosave and the live updates never write it.
- **Use selected** saves; **Keep as is**, opening another item or leaving the page drops the preview.
- Previewing an option for an item that is not on screen switches to it.

## The agent files
- Writers offer 3 titles (articles; a post's title is only its name) and 2 card headlines with every first draft (confirmed by the owner), and other options when asked.
- The reply names the fields with options and does not list them as text.
- A rubric line: every offered value meets the field's standard.
