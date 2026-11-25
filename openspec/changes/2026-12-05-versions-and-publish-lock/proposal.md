# Versions of every change, and published items stay published

**Status:** built.

## Why
An assistant now saves posts and articles itself, turn after turn. The person needs each of those states to be a numbered version, and to bring an earlier one back. What was published must not drift.

## What changes
- **Every assistant change is a version** (text or card text). What the person had just before is kept as a version too, if none holds it.
- **The newest version number is shown** above the canvas, marked "edited" when the text has changed since.
- **Make current:** an earlier version can be brought back; that saves it as a new version, which becomes the current one. Nothing is overwritten.
- **A published item cannot be changed** (a sent post, or anything with a live public page), by the person or an assistant, until it is brought back to draft. A post waiting to be sent is locked as before. Reverses the earlier rule that editing an approved or published item silently returned it to draft; that now applies to approved items only.

## The person's own typing
A version for every keystroke would bury the history. The person's edits are saved continuously and become versions as before (at most one automatic version every ten minutes, and on approve, send, save by hand), and always just before an assistant change.
