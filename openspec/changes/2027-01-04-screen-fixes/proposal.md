# Screen fixes: phones, unsaved settings, greeting footers

**Status:** 2 of 3 bolts built and tested; not released. Found in the known gaps on 2026-11-27, on `v0.4.1`.

## What was seen
- On a phone, the expanded article editor gave most of the width to the outline: the text ran one or two words to a line.
- The article's full preview drew the card wider than a phone.
- Reloading the page lost unsaved settings without asking.
- The footer was faint on pale greeting cards.

## What changes
- The previews take the width there is. The outline shows from 768 px.
- A settings form with unsaved changes asks before a reload or a closed tab.
- On the greeting layout the footer is larger and stronger. This also changes how earlier greeting cards draw; pictures
  already published do not change.

No database, server or agent change.
