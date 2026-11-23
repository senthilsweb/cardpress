# Logo small line and per-element fonts

> Backdated record, written 2026-11-22.

## Why
The logo had only a small line above the text, and every card used the same three fonts.

## What changes
- **Logo line:** one small line with an Above or Below toggle (`logoSubPos`, default above).
- **Fonts:** five roles (titles, body, labels, logo text, big number). The profile sets defaults; each card can override any role. Fonts are Google families loaded on demand, plus 3 bundled ones. 18 are listed; more can be added from the Profile tab (stored in the browser) or by editing `GOOGLE_FONTS`.
- **Export:** waits for fonts to load and rebuilds embedded font CSS when new families load.

## Compatibility
Existing saved profiles keep working: new fields are optional and the old font names are still valid.
