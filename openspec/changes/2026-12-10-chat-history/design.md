# Design
- Migration: `chat_messages` gains `status` (`done`, `failed`, `stopped`) and `detail` (JSON: steps, saved versions with draft ids, check results, error).
- The reply handler records steps as they arrive and writes the reply row also when it fails.
- A failed reply is left out of the history sent to a restarted session, except that it failed.
- On screen, a reply card: text, then "Saved: Article v2" (opens that version), the check result, options, and a folded "What it did".

## As built
- Migration `0024`. Options and what was chosen come with step 8.
- The check result is no longer written into the reply's text; it is kept as data.
- A failed reply keeps no text, so that an answer that failed its checks is never stored. A reply may have no text at all when the check or a saved version says everything.
- Saved versions are found by comparing each item's versions before and after the reply, so they are found also when it fails.
- Older conversations: `GET /api/v1/chat/conversations?profileId=…&after=<last id>`.
