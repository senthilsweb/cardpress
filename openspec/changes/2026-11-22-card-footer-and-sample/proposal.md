# Card footer and sample card

## Why
The card's footer was one left-aligned line sitting high on the card, unlike the author's existing LinkedIn covers, which have a quiet link on the left and the main link at the bottom right. A new card also started with "Your headline goes here", which shows little of what a card looks like.

## What changes
- **Footer:** small print at the very bottom edge with no rule above it: text on the left (muted) and text on the right (accent colour, semi-bold, right-aligned at the bottom right). Two fields, "Footer, left" (empty = the profile website) and "Footer, right" (empty = the profile handle). It uses the same layout in every card layout and size. The text is no longer forced to upper case, so links read as written.
- **Sample card:** a new design starts from the text of a real post in the author's series ("Many Questions. One SQL Row."), on the cream-emerald palette with the gradient-mesh background, the same combination as that post's recommended cover.
- A saved card whose eyebrow, title and subtitle are all still the old placeholder text is given the sample text when it loads. Anything the user has typed, and their layout, colours and background, are left alone.

## Decisions
- The sample text is public post content that the author wrote. Nothing from the surrounding private records was used.
- Only a card with all three placeholder texts untouched is upgraded, so an edited card is never rewritten.
