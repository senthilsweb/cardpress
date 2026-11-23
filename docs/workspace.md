# Workspace

How the studio screen is arranged, and what is remembered.

## Sidebar

- **Hide or show** the whole sidebar with the button at the left of the header, or **Ctrl/⌘ + \\**. The canvas grows to use the space, and the editor's expanded view gets the full width. On a narrow screen the sidebar sits above the canvas and hiding it removes it.
- **Fold sections.** Click a section's title (Draft, Hashtags, Colours…) to fold or unfold it. Folded fields cannot be reached with Tab, so they do not get in the way of the keyboard.
- The editor in the Post tab can be **dragged taller or shorter** from its bottom-right corner.

All of this is remembered: it is saved on the server as the `layout` preference, so it is the same in any browser that uses the same server.

## Drawers

Settings and other tool panels slide in from the right as a drawer (`components/ui/drawer.tsx`), for example **Social accounts** from the gear in the header. A drawer does not dim or block the studio. Its header matches the app header, the body scrolls, and the action buttons are frozen in a footer. Esc closes it.

## Canvas

The work area behind the card is a white sheet with a fine grid (10 px lines, a slightly stronger line every 50 px), in the style of a diagramming tool. The dark theme uses a dark sheet with faint light lines. The grid moves with the content when the canvas scrolls. It is drawn with CSS (`.canvas-grid` in `web/src/styles/global.css`); change `--canvas-bg`, `--canvas-grid-minor` and `--canvas-grid-major` to restyle it.

The expanded post editor has a plain background, without the grid.

## Code map

| File | What it does |
|---|---|
| `web/src/lib/layout.tsx` | The `Layout` type, safe parsing of the saved value, and the context sections read |
| `web/src/components/studio/fields.tsx` | `Section`, the foldable group |
| `web/src/components/studio/Studio.tsx` | Sidebar hide/show and the shortcut |
