# LinkedIn publish and schedule

## Why
Posts should go out from the app with the composed text and the chosen design, now or later.

## What changes
- **Posts** publish through the LinkedIn Images API (upload the card PNG) and Posts API (caption, image, alt text). **Articles** are not published; they are copied.
- The browser renders the card PNG and uploads it with the draft at publish or schedule time. The image is stored with the job so a later run does not depend on the browser.
- **Lightweight scheduler** in the Go process, backed by the DB. States: `scheduled → publishing → published`, plus `failed`, `missed`, `needs_review`, `cancelled` (all four wait for a person).
- Publish and schedule controls live in the Full preview (a second confirmation is required); the queue lives in the Post tab.
- Hashtags are sent as LinkedIn hashtag templates on a last line; the rest of the text is escaped.
- Publish now, schedule for a date and time (timezone stored and shown), reschedule, cancel, and a history list with the LinkedIn post URL.

## Decisions
- LinkedIn gives no idempotency key, so a crash during `publishing` is never retried automatically; the job becomes `needs_review`.
- A scheduled job within a grace window (default 15 minutes, `SCS_MISSED_GRACE`) of its time is sent; a later one becomes `missed` for a human decision. This is checked at every scheduler tick, not only at start-up, so a server that was asleep never posts hours late.
- **`failed` and `needs_review` differ.** `failed` means LinkedIn or the network refused and the post is known not to exist. `needs_review` means it may exist: the create call's answer was lost or was a server error, the id was missing, or the server stopped or hung mid-publish. Repeating a `needs_review` job needs an explicit confirmation that a duplicate is possible.
- **Publishing is human-driven and deterministic.** A person confirms every publish or schedule; no LLM or agent is in this path.
- **No automatic retries.** Any failure sets the job to `failed` with LinkedIn's message, and a person corrects it and publishes again, reschedules or cancels.
- Scheduling depends on the process staying up. Documented.
