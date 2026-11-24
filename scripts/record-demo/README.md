# Recording the demo

Makes the animated demo used on the landing page and in the README. It drives a clean CardPress in Chrome, with a visible cursor, and writes `out/demo.gif` (about 2 MB).

```bash
make build                       # or: go build -o bin/cardpress .
cd scripts/record-demo && npm install
./run.sh gif                     # starts CardPress on a temporary database, records, stops it
cp out/demo.gif ../../web/public/demo/cardpress-demo.gif
cp out/demo.gif ../../docs/media/cardpress-demo.gif
```

- **Your own article**: `SOURCE_FILE=/path/to/article.txt ./run.sh gif`. The text is pasted into the assistant; `source.txt` is only a stand-in. The card text typed afterwards is in `record.mjs`.
- **Assistant**: the recording uses whatever agent the server runs; with the built-in demo agent the "no AI model" badge is visible. Start the server with a real agent configured to record that instead (`CARDPRESS_BIN` picks the binary).
- **Smoother video**: `./run.sh video` writes a WebM, but needs Playwright's ffmpeg (`npx playwright install ffmpeg`).
- Needs Chrome installed and Node 20+. Nothing here is part of the app build.
