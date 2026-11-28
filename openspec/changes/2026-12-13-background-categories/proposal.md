# Background categories and seasonal greetings

**Status:** released and deployed (2026-11-26).

## Why
All backgrounds sit in one list and all are abstract. A greeting post (Thanksgiving, Diwali, New Year, Chinese New Year) needs artwork of its own, and a longer list needs categories.

## What changes
- A background may name a **category** and, inside it, a **group**. Without one it is in **Abstract**, so existing backgrounds and drop-ins need no change.
- The Design panel shows one category at a time, with a heading per group. It opens on the category of the card's background.
- Drop-ins stay a design-time plugin: any file under `web/src/card/bg/`, folders included, is picked up by the build. A file may export one background or a list of variations.
- A new category, **Seasonal greetings**, drawn as vector art (SVG):

| Group | Variations |
|---|---|
| Thanksgiving | Maple weave (interlaced leaves), Maple line art, Falling leaves |
| Diwali | Diyas, Rangoli, Marigold garlands |
| New Year | Fireworks, Confetti, Midnight clock |
| Chinese New Year | Red lanterns, Plum blossom, Lucky clouds |

- Five seasonal palettes join the standard ones and appear for every brand.

## Rules
- Seasonal art keeps its festive colours on every palette, adjusted for light and dark. Text still follows the palette.
- Art is seeded: **Shuffle** rearranges it and an export matches the screen.
- Choosing a background never changes the card's text.
- The logo and footer stay readable: dense art is cleared behind them.

## Out of scope
Adding backgrounds without a build, uploading vector files, greetings picked by date, and the assistant choosing a background.
