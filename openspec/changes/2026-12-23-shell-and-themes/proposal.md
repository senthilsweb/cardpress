# A header, a labelled side bar, and colour themes

**Status:** proposed (asked for by the owner on 2026-11-26, with a reference picture). Not built.

## Why
The navigation is icons without names, the logo and brand sit in the same square, and the colours cannot be chosen.

## The frame
```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◆ CardPress   [ Brand ▾ ]      page controls            ☾   ?   (person) │  header, 48 px
├───────┬──────────────────────────────────────────────────────────────────┤
│  ✎    │ ╭──────────────────────────────────────────────────────────────╮ │
│ Studio│ │                                                              │ │
│  ▤    │ │   the page, on its own rounded surface                       │ │
│Library│ │                                                              │ │
│  ▦    │ │                                                              │ │
│Calendar│ │                                                             │ │
│  ▣    │ │                                                              │ │
│ Media │ │                                                              │ │
│  ?    │ │                                                              │ │
│ Guide │ │                                                              │ │
│  ⚙    │ ╰──────────────────────────────────────────────────────────────╯ │
│Settings│                                                                  │
└───────┴──────────────────────────────────────────────────────────────────┘
```
- **Header:** logo and name at the left, the brand switcher beside it, the open page's main controls in the middle, and
  mode, guide and the person at the right.
- **Side bar:** about 84 px, an icon with its name under it, the open one in a rounded outline; an arrow where an item
  has sub-pages. It can shrink to icons.
- **Surface:** the page sits on a rounded panel set into the frame colour.
- **Studio:** the item picker and **New** move into the header, so the header costs the canvas no height.
- **Phone:** a short header and the bar along the bottom, as now.

## Themes
| Theme | Frame | Accent |
|---|---|---|
| Parchment (default) | today's dark green and cream | green |
| Aubergine | deep purple header and side bar, light surface | plum, with a warm highlight |
| Ocean | deep blue | blue |
| Graphite | neutral grey | slate |

- **Settings → Appearance:** theme swatches with a small preview, and Light, Dark or System. Saved for each person on
  the server.
- A theme is a set of named colours (frame, surface, text, accent, borders); components use the names only.
- Every theme meets contrast for text and focus in light and dark.
- Themes colour the application only. A card's colours stay its brand's palette.

## Replaces
In `openspec/project.md`: "There is no navigation along the top" and the flyout panels of the rail, once built.

## Out of scope
A custom colour of one's own (later, once the named colours have settled), a theme per brand.
