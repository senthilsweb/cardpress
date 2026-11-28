# Greeting cards: words that fit, art that shows

**Status:** built (3 bolts) and tested; not yet deployed. Reported by the owner on 2026-11-27, on `v0.4.0`. Follows `2026-12-19-greeting-layouts`.

## What was seen
- On the greeting layout the background looked faded: a wash up to 95% solid lay over most of the card.
- The ornament could not be seen. When the words were taller than their space, which happens first on wide sizes, the
  ornament was squeezed to nothing and the small line could run into the logo.
- The ornament choices sat far down the Design column.

## What changes
- The greeting's words keep their shapes; when they are too tall, the whole block is made smaller until it fits.
- A smaller, lighter wash behind the words, set with the **Shading** slider (as for one's own picture). It starts at 70%
  when a greeting layout or a background for one is chosen. A card made before keeps its wash until the slider is moved.
- On greeting cards, **Ornament** comes directly under **Background**.

## Rules
- Art that frames the card (`frames`) and the plain background have no wash and no slider.
- The strips that keep the logo and footer readable over busy art stay.
- No headline still means no ornament: it separates the headline from the message.
- No database, server or agent change: the card's `shade` is used.
