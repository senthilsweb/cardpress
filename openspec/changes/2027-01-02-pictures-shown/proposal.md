# An added picture is seen

**Status:** built (asked for by the owner); released in `v0.4.0`; deployed.

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

## Shading one's own picture
The older shading covered a square or tall card most where it has no words, and no setting showed the picture as it is.

- With a background picture, one **Shading** slider (0 to 100%) takes the place of **Background strength** and
  **Bottom fade**, and **Shuffle**, which changed nothing, is hidden.
- The shade lies behind the words wherever the layout puts them, and lightly behind the logo and footer. At 0% there is
  none.
- A newly added picture starts at 70%. A card made before keeps its look until the slider is moved.
- The card design gains `shade` (0 to 1). No database migration; the assistant cannot change it.

## Out of scope
Drawing two kinds of picture at once.
