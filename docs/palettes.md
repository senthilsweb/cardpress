# Palettes

The profile offers 28 colour sets, defined in `web/src/lib/profiles.ts`:

- **Personal (4):** Paper, Ink, Deep teal, Teal paper.
- **Cover (8):** Cream emerald, Deep navy cyan violet, Blue pink gloss, Dark neon pink blue, Privacy orange coral, Light blue purple, Charcoal gold teal, Soft slate copper.
- **Brochure (16):** eight brochure palettes, each in a dark and a light variant. Aubergine (`#4A154B`) is one of them.

Aubergine is not the default. New designs start on Ink.

## Colour mapping (cover palettes)

`background` becomes `base`, `primary` becomes `text`, `secondary` becomes `sub`, `accent` stays `accent`. `fade` is `soft` blended into the background.

## Saved profiles

Profiles are stored in the browser (`scs.profiles.v1`). On load, `withStandardPalettes` appends any standard palette whose id is missing and leaves existing and edited palettes alone. To add a palette for everyone, add it to `standardPalettes`.
