# Recording the demo and the guide's screenshots

Drives a throwaway CardPress in Chrome and writes pictures of it: a new database, one test account, example brands (TemplrPress and others) and a **scripted stand-in** for the assistant. Nobody's real work is read, no AI is used and nothing costs anything.

```bash
cd web && npm install && npm run build && cd ..
go build -o bin/cardpress .      # from the repository root
cd scripts/record-demo && npm install

./run.sh                         # the animation, out/demo.gif (about 2 MB, 1200 px wide)
cp out/demo.gif ../../docs/media/cardpress-demo.gif
cp out/demo.gif ../../web/public/demo/cardpress-demo.gif

./run.sh shots                   # writes brands, social, calendar and picker into web/guide/img
```

It uses ports 18300 and 18301 on this machine. Needs Chrome and Node 22+. Nothing here is part of the app build.

## What the animation shows
A new post, a Thanksgiving greeting asked for in the chat, the greeting layout and a seasonal background, headline options, the details and the full preview, the library, the calendar and the themes. The story is in `record.mjs`; what the stand-in writes is in `stand-in.mjs`; the example data is in `setup.mjs`.

## The guide's other screenshots
`post-chat.jpg`, `post-details.jpg`, `post-preview.jpg` and `library.jpg` show real work, so they are taken by hand on a real installation. Look through them before committing: the repository is public.

## Repeatable
The script is fixed, `Math.random` is seeded, transitions, spinners and the caret are frozen, fonts and paint are awaited before each frame, and frame delays are explicit. Dates shown in the library and calendar are the day of recording, so two recordings differ there.

## Quality and review
Frames are captured at 2x and scaled down, and every frame after the first gets its own colour palette built from the pixels that changed. `DUMP=1 ./run.sh` also writes each frame to `out/frames/`.
