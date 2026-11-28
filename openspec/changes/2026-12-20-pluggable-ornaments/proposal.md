# Pluggable ornaments

**Status:** built (asked for by the owner on 2026-11-26); not yet deployed. Follows `2026-12-19-greeting-layouts`.

## Why
The greeting layout draws one ornament, a heart flourish, with an on/off switch. Other occasions need their own, and
adding one means editing the card code.

## What changes
- An ornament is a small vector drawing in its own file under `web/src/card/ornament/`, picked up when the app is built,
  as backgrounds are.

```ts
interface OrnamentDef {
  id: string; name: string;
  occasions?: string[];                       // where it is suggested first
  render: (c: { width: number; colour: string }) => ReactNode;   // draws in a 270 × 30 box
}
```

- Starter set: Heart flourish (today's), Plain divider, Leaf sprig, Diya, Sparkles, Plum blossom.
- **Design → Ornament**: small previews and **None**, in place of the switch.
- A card keeps `ornament`: an id, or `none`. Without it: the heart flourish, so existing cards look the same. A card
  saved with `noOrnament` reads as `none`.
- Colour follows the palette. The picker lists the ornaments suiting the background's
  occasion first. A greeting template, when templates are built, picks the occasion's ornament.

## Server
`ornament` is added to the card design (a short id, checked like `background`). No migration. The assistant cannot
change it.

## Out of scope
Uploading ornament files, sizing or colouring one separately, ornaments in other layouts.
