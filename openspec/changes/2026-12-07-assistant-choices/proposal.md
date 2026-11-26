# Choosing between the assistant's options

**Status:** proposed. Specification only: nothing is built. Builds on `2026-12-06-content-schema`.

## Why
The assistant sometimes answers with several titles or lines. They arrive as chat text, so the person has to copy one into the right field by hand.

## What changes
- A new tool, `offer_choices`: the assistant saves its recommended value as usual and offers the alternatives as data.
- The chat shows each field as a set of options (radio buttons; a drop-down when there are more than four), with the recommended one marked. The same options appear beside the field in Details.
- **Selecting an option changes the card and text on screen at once**, as a preview.
- **Use selected** writes the choices to the draft at once, as one new version. No model is called, so it costs nothing.
- The assistant learns of the choice with the person's next message.

## Rules that stay
- Only fields the schema marks for choices. Never the look, never the status.
- Published and scheduled items cannot be changed.
- Ignoring the options keeps what was saved. A preview is never saved until Use selected.

## Out of scope
Choosing between whole bodies of text, and the assistant waiting for an answer before it continues.
