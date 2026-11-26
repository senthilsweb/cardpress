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
| `POST /api/v1/chat/choices/apply` | `{draftId, picks: [{choiceId, option}]}`: one version, label "chosen" |
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

## The agent files
- Writers offer 3 titles and 2 card headlines with a first draft, and other options only when asked. (To confirm: this adds a little cost to each first draft.)
- The reply names the fields with options and does not list them as text.
- A rubric line: every offered value meets the field's standard.
