# Sign-in kept in memory, and the prompt cache measured

**Status:** proposed by the owner on 2026-11-28; waiting for the owner's go-ahead.

## Asked for
When a person has signed in, keep what is known about them so it is not queried every time; and the prompt cache.

## Found on `v0.6.0`
| Area | Now |
|---|---|
| Each signed-in request | Four to six queries: the session, the security settings, the person, the roles, a write of the last use (at most every 15 s), and the brand's owner on brand routes |
| Kept in memory | Only failed sign-in counts and the sign-up limit |
| Prompt cache | The platform caches a session's repeated tokens by itself. Brand notes go only in a session's first message, which keeps the start of a session the same. The share of cached tokens is not recorded |

## What changes
- **A session's person in memory.** After the first request the session, the person, the roles and the session limits
  are kept in memory for up to 30 seconds. The last use is counted in memory and written at most every 15 seconds, as
  now. The idle and longest times are still enforced on every request, from memory.
- **Dropped at once** on sign-out, sign out everyone, a change of role or password, disabling a person, and a save of
  the security settings. So a change still takes effect on the next request.
- **Brand owners and assistant settings** are kept the same way and dropped when a brand or its settings change.
- **One instance.** The memory is the server's own. `CARDPRESS_SESSION_CACHE=off` turns it off, for a deployment with
  more than one instance.
- **Prompt cache.** Each reply records the session's cached and uncached input tokens. The dashboard shows the cached
  share. Brand text that changes (a guide, the notes) stays out of system prompts, so sessions keep a common start.

## Not in this change
A shared cache between instances; caching of drafts, jobs or media.
