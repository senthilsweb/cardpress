# Choosing options, and saving a reply as a version

**Status:** built, released and deployed (2026-11-26).

## Why
The assistant answered with several titles as chat text, so the person had to copy one by hand. And every attempt it made became a version, filling the history.

## What changes
- A new tool, `offer_choices`. The chat shows each field's options as radio buttons (a drop-down above four), recommended first; the same options appear under the field in Details.
- Selecting an option previews it on the canvas at once. Nothing is saved.
- **An assistant's change in a chat reply goes into the draft but is not a version.** **Save as version** applies the picked options and saves it. **Undo** puts the item back as it was before that reply. No model is called by either.
- This replaces "every assistant change is a version" (`2026-12-05-versions-and-publish-lock`) for the built-in chat. Outside agents have no button, so their changes stay versions.

## Rules that stay
- Only fields the schema marks for choices. Never the look, never the status.
- Published and scheduled items cannot be changed.
- What the person typed is kept as a version before an assistant changes it.

## Out of scope
Choosing between whole bodies of text, the assistant waiting for an answer, and undoing a change of attachment.
