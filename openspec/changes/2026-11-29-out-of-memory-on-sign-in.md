# Issue: the deployed server was killed for running out of memory

Status: **fixed and released.**

## What was seen
On the 256 MB Fly machine, a few minutes after an admin signed in and added a person, the server stopped answering. The log says: `Out of memory: Killed process (cardpress)`, about 162 MB in use. Fly restarted it; nothing was lost (the new account was already saved).

## Cause
Every password check or new password is an argon2id hash that needs 64 MB. Go does not hand that memory back at once, there was no memory limit set, and nothing stopped several hashes running together. A sign-in, a new account and another sign-in close together were enough.

## Fix
- One password is hashed at a time, and its memory is returned straight away (`argonKey` in `internal/service/accounts.go`).
- `fly.toml` sets `GOMEMLIMIT=150MiB`, so Go cleans up well before the machine's limit.
- `docs/fly.md` says to raise the limit with the machine size.

## Checked
Eight password checks started at once under the limit left the process at 83 MB. Not yet watched on the deployed machine.
