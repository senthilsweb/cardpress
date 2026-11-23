# Composer: rich text and full preview

## Why
The Post tab is a plain caption textarea with character counts. It cannot express structure, shows no realistic preview, and is undocumented.

## What changes
- **Draft** becomes a first-class record: kind (`post` or `article`), rich document (TipTap/ProseMirror JSON), hashtags, image alt text, the Unicode-styles option, status. Stored through the API. The card design stays the profile's working design; a draft does not copy it, so the card is always the one on screen. A later publish job snapshots the rendered image.
- The old plain `caption` is migrated into the first draft, once.
- **Post** drafts: rich editor with paragraphs, bullet and numbered lists, hashtags. A serializer lowers the document to LinkedIn plain text. Bold and italic are opt-in and become Unicode styled characters, with a visible accessibility warning.
- **Article** drafts: full formatting (headings, bold, italic, links, lists). Articles are not published by API. A "Copy formatted" action puts `text/html` and `text/plain` on the clipboard for pasting into LinkedIn's article editor or a blog.
- **Full preview** before any publish or schedule: the exact serialized text, the "see more" fold, and the card image in a LinkedIn feed frame. Publish and schedule actions are only reachable from that preview.
- The design (layout, palette, background) stays user-selected from the existing presets.
- **The current studio layout is kept**: header, left sidebar with tabs, canvas with its two toolbars. The rich editor replaces the textarea inside the existing Post tab, and the existing Feed preview is extended rather than replaced.
- **Expanded editor:** an expand button opens the editor as an overlay over the centre of the studio (sidebar stays), with Copy, Full preview and Collapse; Esc or leaving the Post tab collapses it.
- **Canvas:** see `workspace-panels` (a white sheet with a fine grid, like a diagramming tool). The expanded editor has a plain background.
- **Taller editor:** the sidebar editor can be dragged taller or shorter, and the height is remembered.
- New `docs/post-authoring.md`.

## Out of scope
`@mentions` (LinkedIn needs member URNs that cannot be looked up freely), scheduling, publishing.
