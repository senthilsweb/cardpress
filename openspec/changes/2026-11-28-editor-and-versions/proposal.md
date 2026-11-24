# A better long-article editor, and version history

**Status:** Implemented. Not verified: window blur and `beforeunload` flushes, narrow screens, dark mode, the slash menu's Picture command.

## Why
In the maximized editor the formatting toolbar scrolled away with a long article, so editing meant scrolling up and down. Typing felt slow on an article with many pictures. And there was no way to go back to an earlier state of an item.

## What changed
1. **Fixed toolbar** in the maximized editor: the toolbar, table controls and link form sit in the fixed header; only the text scrolls. A fixed footer shows words, reading time, characters and the save state.
2. **Easier long editing:** a floating menu on selected text (bold, italic, link, heading), a `/` menu to insert a block (heading, picture, table, code block, quote, divider, lists), an outline of the headings that jumps to one, and a choice of text width and size.
3. **Typing pause.** Article typing reaches the store after a 250 ms pause and is flushed before anything reads the text. Measured on an article with seven pictures: render work per keystroke fell from about 10.9 ms to about 3.0 ms (same session; the machine was noisy). The cause was not mainly the document size: it was a whole-studio re-render and an article HTML built on every render.
4. **History.** `draft_versions` keeps an item's states (created, approved, sent, restored, saved by hand, and after editing at most every ten minutes), at most 100 per item. Pictures are stored once in `doc_blobs`. Open one to read it; **Restore** is an edit (an approved item goes back to draft, and the text before is kept). **Save a version** takes a note.

## Out of scope
Comparing two versions side by side, comments, real-time editing by several people.
