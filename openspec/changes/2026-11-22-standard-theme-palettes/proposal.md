# Standard theme palettes

> Backdated record, written 2026-11-22.

## Why
The eight cover colour sets and Aubergine were reachable from only one profile, or not at all.

## What changes
Add the 8 cover palettes, mapped to the card palette shape, and offer all 28 sets (Personal 4, cover 8, brochure 16) to every profile. Aubergine is not the default; new designs start on Ink. Saved profiles gain missing palettes on load (`withStandardPalettes`) and keep their edits.

## Decisions
- Cover `secondary` maps to `sub` and `accent` to `accent`, so eyebrow text stays readable on light themes.
- Overlapping names (Emerald, Cream emerald) are both kept.
