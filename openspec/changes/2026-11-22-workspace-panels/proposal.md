# Workspace panels

## Why
The sidebar is narrow and always open, long tabs need a lot of scrolling, and the dotted canvas looked unlike a design editor. The overall layout is liked and must not change significantly.

## What changes
- The sidebar can be hidden and shown (header button, Ctrl/⌘ + `\`) with a short slide. The canvas takes the freed width.
- Every section in the sidebar folds and unfolds from its title, with an animated height change. Folded content is `inert`.
- The canvas becomes a white sheet with a fine grid (10 px minor, 50 px major lines), in the style of a diagramming tool, with a dark equivalent. The grid scrolls with the content.
- The sidebar post editor can be dragged taller or shorter. The expanded editor has a plain background.
- Sidebar visibility, folded sections and the editor height are saved as a `layout` preference on the server (nothing in browser storage).

## Decisions
- No new regions or panels: the existing header, tabbed sidebar and canvas stay as they are.
- Section state is keyed by an id (the title unless a section passes one), so renaming a title would reset only that section's state.
- The layout value is parsed defensively; anything unexpected falls back to the default.
