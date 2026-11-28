# An added picture is seen

**Status:** built (asked for by the owner on 2026-11-27); not yet deployed.

## Why
A card holds three kinds of picture, and the chosen background decides which is drawn. Adding a background image to a
card with another background changed nothing, and nothing said why.

## What changes
| Added under Design → Images | The card switches to |
|---|---|
| Background image | Own image |
| App screenshot | Browser frame |
| Photos | Photo mosaic, except on the Headshot layout when the photo is the headshot |

- A message says the background changed, with **Undo**. The picture stays on the card.
- Removing a picture changes no background.
- A picture the card holds but does not draw says **Not on the card**, with **Use**.
- **Photos for the mosaic** is now **Photos**, and each field says in one line where it appears.
- Public-domain pictures for trying this are kept in `testdata/media/`.

## Out of scope
Drawing two kinds of picture at once.
