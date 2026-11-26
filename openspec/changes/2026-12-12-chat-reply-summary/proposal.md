# Chat: a short reply instead of the agent's running text

**Status:** approved and built 2026-11-26; not deployed.

## Why
The chat shows everything the assistant writes while it works, including its narration between tool calls. The person wants to read what happened, briefly. The assistant needs a fixed shape to answer in, so the screen does not depend on how talkative a model is.

## What changes
- The coordinator ends every turn with one structured reply, through a studio tool, `report_reply`.
- The chat shows that reply on a card, with what was saved and how the check went. While the assistant works it shows the current step, not its text.
- The shape is a typed model in the agent project, like the other tool inputs.

## Rules that stay
- The studio says what was saved, the version and the check result from its own records. The assistant is not asked to repeat them.
- A failed or stopped reply is shown as it is now.

## Out of scope
Options to choose from (`2026-12-07-assistant-choices`), which this prepares for.
