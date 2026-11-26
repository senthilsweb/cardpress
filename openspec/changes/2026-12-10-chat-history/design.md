# Design
- Migration: `chat_messages` gains `status` (`done`, `failed`, `stopped`) and `detail` (JSON: steps, saved versions with draft ids, check results, error).
- The reply handler records steps as they arrive and writes the reply row also when it fails.
- A failed reply is left out of the history sent to a restarted session, except that it failed.
- On screen, a reply card: text, then "Saved: Article v2" (opens that version), the check result, options, and a folded "What it did".
