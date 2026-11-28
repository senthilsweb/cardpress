# Answer buttons for the assistant's questions

**Status:** built in both repositories and tested with the stand-in (asked for by the owner on 2026-11-26). The studio is deployed in `v0.5.0` (2026-11-28); the agent is not applied; not tried with the real agent.

## Why
The assistant sometimes asks for a Yes or No, or whether to continue. The chat shows the question as text only, so the
person has to type the answer. Options for a field already have radio buttons and a drop-down; questions do not.

## What changes
`report_reply` gains `answers`: the replies the person can press.

```
report_reply
  outcome:  needs_answer
  message:  The article draft is ready; the post is not written yet.
  question: Write the post as well?
  answers:  ["Yes", "No"]
```

| Field | Rule |
|---|---|
| `answers` | Optional. 1 to 4 different texts of at most 40 characters. Only with `question` and `needs_answer` |

- **Coordinator:** whenever a question has a few fixed answers (yes or no, continue or stop, this or that), it sends
  them in `answers`. An open question has none. Choices between values of a field stay with `offer_choices`.
- **Studio:** shows them as buttons under the question. Pressing one sends its text as the person's message. The message
  box still takes any other answer.
- Only the latest reply has live buttons; after an answer they show which was chosen.
- Each press starts a new turn, like a typed message.

## Rules
- A button never publishes, schedules or deletes. Publishing stays in the Full preview.
- The studio makes no buttons of its own from the wording of a question.

## Order of release
1. Studio: accept and show `answers`.
2. Agent: schema and coordinator instructions (`ant apply`, new manifest).

## Not covered
A tool that waits for permission (`requires_action`) still ends the turn with an error in the studio. Supporting such a
confirmation is a separate change.
