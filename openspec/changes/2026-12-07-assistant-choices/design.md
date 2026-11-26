# Design

## The tool
`offer_choices { conversationId, draftId, fields: [ { field, options: [ { value, note? } ] } ] }`

- 2 to 6 options a field, up to 5 fields a call; the first is the recommended or the saved one. `value` is text (hashtags: a list).
- Every value passes the same checks as a write to that field. One bad value refuses the call.
- Only while a reply of that conversation is being written, for an item of it. It changes no draft.
- `create_draft` takes `conversationId`, so an item made during a reply is saved or undone like the others.

## Storage (migration `0025`)
- `chat_changes`: one row per item a reply changed, with the item as it was. `open` while the reply is written, then `pending`, `saved`, `undone`, or `passed` once a later reply changes the item. A row with no item marks that a reply is being written.
- `choices`: one row per field offered. A newer offer for the same item and field supersedes the older.

A writing tool knows it is part of a reply because the item has an `open` row younger than 30 minutes.

## Requests
| Request | Purpose |
|---|---|
| conversation read | includes `changes` and `choices` |
| `POST /chat/conversations/{id}/replies/{messageId}/save` | `{picks: [{choiceId, option}], revisions}`: applies the picks, one version for each item |
| `POST /chat/conversations/{id}/replies/{messageId}/undo` | puts back every item the reply changed; all or nothing |

Both are refused, changing nothing, when an item moved on since it was shown, is locked, or a reply is being written.

## On screen
```
Title
  (•) How short data contracts stopped our breakages   recommended
  ( ) Eleven broken dashboards, then two               leads with the number

Post: changed, not saved as a version
                         [ Keep as is ] [ Undo ] [ Save as version ]
```

## The agent files
- Writers report two more titles (articles) and card headlines with a first draft; the coordinator offers them, and offers options when asked.
- Replies never list the options or mention version numbers.
- Content schema version 3 adds the tool input. The manifest stays version 6.
