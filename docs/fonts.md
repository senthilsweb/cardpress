# Fonts

Fonts are chosen per element, not one font for everything.

| Role | Used for | Default |
|---|---|---|
| Titles | Headline, quote mark | Profile "Titles" |
| Body | Subtitle and general text | Profile "Body" |
| Labels | Eyebrow, footer, series tag, quote author | JetBrains Mono |
| Logo text | Logo and its small line | Same as Labels |
| Big number | Stat layout number | Same as Titles |

Set the defaults on the **Profile** tab. On the **Design** tab, "Fonts (this card)" overrides any role for the current card only. Order of precedence: card override, then profile, then the built-in default (`resolveFonts` in `web/src/lib/fonts.ts`).

## Google Fonts

The picker lists 3 bundled fonts (always available offline) and 18 Google families grouped as Sans, Serif, Display and Mono. Google families load on demand from `fonts.googleapis.com`, so they need a network connection the first time.

### Add a family while using the app

Profile tab, **Add a Google font**: type the family exactly as it appears on fonts.google.com (for example `Lexend`) and press Add. The app checks that Google serves it, then remembers it in this browser (`scs.customFonts.v1`).

### Add a family permanently

Append a line to `GOOGLE_FONTS` in `web/src/lib/fonts.ts`:

```ts
{ family: "Lexend", category: "sans", source: "google", weights: "400;500;600;700" },
```

`weights` follows the Google css2 syntax. For a family with a single weight use `"400"`. If the full request is refused, the loader retries with the family's default weight.

## Export

PNG export waits for the fonts in use to finish loading and rebuilds the embedded font CSS whenever a new family has been loaded.
