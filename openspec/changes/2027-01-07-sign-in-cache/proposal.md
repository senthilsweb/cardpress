# Sign-in kept in memory, and the prompt cache measured

**Status:** proposed by the owner on 2026-11-28; being built: bolt 1 of 2 done.

## Asked for
When a person has signed in, keep what is known about them so it is not queried every time; and the prompt cache.

## Found on `v0.6.0`
| Area | Now |
|---|---|
| Each signed-in request | Four to six queries: the session, the security settings, the person, the roles, a write of the last use (at most every 15 s), and the brand's owner on brand routes |
| Kept in memory | Only failed sign-in counts and the sign-up limit |
| Prompt cache | The platform caches a session's repeated tokens by itself. Brand notes go only in a session's first message, which keeps the start of a session the same. The share of cached tokens is not recorded |

## What changes
- **A session's person in memory.** After the first request the session, the person, their roles and the session
  limits are kept in memory for up to 30 seconds. The time of use is written to the database at most every 15 seconds,
  as before. The idle and longest times are still enforced on every request, and a session kept in memory is never
  ended without reading it again.
- **Forgotten at once** on every change made in the app: sign-out, sign out everyone, a role or password, disabling a
  person, their details, and the security settings. All of it is forgotten, which is simple and cannot miss a case.
- **Brand owners** are still read each time: it is one quick read, and keeping it would put the access check at risk
  for little gain.
- **One instance.** The memory is the server's own. A change made by another process (the command line, a second
  server) is seen within 30 seconds, or at the next write of the time of use. `CARDPRESS_SESSION_CACHE=off` turns it
  off.
- **Prompt cache.** Each reply records the session's cached and uncached input tokens. The dashboard shows the cached
  share. Brand text that changes (a guide, the notes) stays out of system prompts, so sessions keep a common start.

## Not in this change
A shared cache between instances; caching of drafts, jobs or media.
