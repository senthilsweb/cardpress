# Issue: LinkedIn "Test connection" rejects the Client ID and secret on the deployed server

Status: **partly fixed.** The message and the log are fixed; the cause on the real account is still to be confirmed (see tasks).

## What was seen
First real check from the deployed server (Fly). The LinkedIn tab in Social settings was filled in and "Test connection" was pressed. Result:

- "LinkedIn did not accept the Client ID and secret together. Copy both again from the app's Auth tab."
- "Author URN looks right (person)."

So the author check passes; the token introspection step is refused with `invalid_client` or `unauthorized_client`.

## Where it comes from
`introspectRejection` in `internal/service/linkedin.go` maps LinkedIn's error code `invalid_client` / `unauthorized_client` to that message. The message is the same for several different causes, so it does not tell the person which one applies.

## Likely causes, to rule out in order
1. The Client ID and the Primary Client Secret belong to different apps, or one has a stray space or newline from copy-paste.
2. The secret was regenerated in the LinkedIn developer portal after it was copied.
3. The token was issued for a different app than the Client ID entered (an access token can only be introspected with the app that issued it).
4. A value set by an environment variable (`CARDPRESS_LINKEDIN_*`) overrides the one typed in the drawer, so the saved value is not the one being tested.
5. The check itself: the introspection call may need different client authentication than the one sent. Not confirmed against LinkedIn's current documentation (see the open items in `2026-11-22-social-settings/tasks.md`).

## What was ruled out
- Whitespace: values are already trimmed when saved (`Settings.Put`).
- Environment override: the deployed server sets no `CARDPRESS_LINKEDIN_*` value.
- Blocking: publishing reads only the access token and the author URN (`internal/service/publish.go`), so a refused app check does not stop a post.

## What changed
- `invalid_client` and `unauthorized_client` now have their own messages (same app and regenerated secret; token made by a different app).
- The result shows LinkedIn's error code as a line, when it is a plain word. The description is still never shown, because it can repeat a secret.
- When only the app's Client ID or secret was refused, the result says the token was not checked and a post can still be tried.
- The server log now records the status of every request, so a refused save or approve can be seen.

## Still open
- Which of causes 1 to 3 or 5 applies on the real account. The request shape is not yet confirmed against LinkedIn's documentation.

## Out of scope
OAuth sign-in flow and token refresh (unchanged from the social settings change).
