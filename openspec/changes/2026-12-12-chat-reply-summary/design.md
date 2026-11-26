# Design

## What the assistant returns
`report_reply`, the last call of every turn:

| Field | Required | Limit | What it says |
|---|---|---|---|
| `conversationId` | yes | | from the `studio` block |
| `outcome` | yes | `done`, `needs_answer`, `not_done` | |
| `message` | yes | 240 characters | one or two sentences: what happened, or the answer |
| `points` | no | 4, each 120 | choices made and why, or the parts of an answer |
| `question` | with `needs_answer` | 200 | the one thing to ask |
| `next` | no | 120 | one suggested next step |

Plain text only. Never the text of a post or article.

```ts
export const ReportReplyInput = z.strictObject({
  conversationId: z.string(),
  outcome: z.enum(["done", "needs_answer", "not_done"]),
  message: z.string().min(1).max(240),
  points: z.array(z.string().max(120)).max(4).optional(),
  question: z.string().max(200).optional(),
  next: z.string().max(120).optional(),
});
```

## Why a tool
- The studio checks each field and refuses a reply that is too long, saying why, so the assistant shortens it.
- It fits what exists: generated tool schema, one server test, the same pattern step 8 uses for choices.
- Asking for JSON inside ordinary text depends on the model getting the format right, and breaks half-written while streaming.

## How the studio handles it
- The tool changes nothing. It checks the limits and that the conversation is the caller's.
- The adapter takes the accepted call's input from the session's events. The last accepted call of a turn wins.
- The assistant's other text is not shown and not stored.
- Stored: the reply in the message's `detail`; its `message`, points and question as the message text, which search and a continued conversation use. No migration.
- **No reply call** (an older agent, or a model that skipped it): the last thing it said is shown, cut at 400 characters.

## On screen
While working:
```
  ◌ The post writer is working
```
Then:
```
  I wrote the post around the broken-dashboards story.
  • Opens with the number of breakages
  • Kept it to 170 words, with your link

  [ Saved: Post v2 ]
  ✓ Post check passed
  Next: want a shorter card headline?
  ▸ What it did
```
`needs_answer` shows the question under the message. `next` is plain text, not a button.

## The agent files
The coordinator: end every turn with `report_reply`, write nothing else, and say nothing about versions or checks. Writers' reports to the coordinator are unchanged.

## Cost and risk
One more tool call a turn. A small model may sometimes skip it, which the fallback covers; the live test shows how often.
