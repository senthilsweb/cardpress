# Recording the demo

Makes the animated demo used on the landing page and in the README. It drives a clean CardPress in Chrome, with a visible cursor, and writes `out/demo.gif` (about 2 MB, 1200 px wide).

```bash
go build -o bin/cardpress .      # from the repository root
cd scripts/record-demo && npm install
./run.sh                         # starts CardPress on a temporary database, records, stops it
cp out/demo.gif ../../web/public/demo/cardpress-demo.gif
cp out/demo.gif ../../docs/media/cardpress-demo.gif
```

## What it shows
The Blue pink gloss colours, the card text (bank statements to cash flow), two looks for the same card (Geometric, then Contours), an article pasted into the assistant and approved into a post, hashtags, the full preview, and the other sizes. The story is in `record.mjs`, the article in `source.txt`.

## Repeatable
The same inputs give the same file, byte for byte (checked by recording twice): a fixed script, the app's default design seed, a seeded `Math.random`, CSS transitions, spinners and the caret frozen, fonts and paint awaited before each frame, and explicit frame delays. `record.mjs` prints a hash of the frame delays and pixels so a change shows up. The same machine, Chrome and fonts are assumed; a different browser version may change anti-aliasing.

## Quality
Frames are captured at 2x and scaled down to 1200 px, and every frame after the first gets its own colour palette built from the pixels that changed, so gradients and text stay clean inside the GIF format's 256-colour limit.

## Options
- **Your own article**: `SOURCE_FILE=/path/to/article.txt ./run.sh`. `source.txt` is only a stand-in.
- **Review frames**: `DUMP=1 ./run.sh` also writes each frame to `out/frames/`.
- **Assistant**: the chat scene was written for the removed demo assistant and its proposal cards. It needs rewriting before the script runs to the end.
- Needs Chrome installed and Node 20+. Nothing here is part of the app build.
