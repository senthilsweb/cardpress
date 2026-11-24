# import-register

Loads posts and articles from a folder of Markdown into a running CardPress through its API. See `docs/import-writing.md`.

```sh
npm install
node import.mjs --register <folder> --server http://127.0.0.1:8080 --dry-run
node import.mjs --register <folder> --server http://127.0.0.1:8080
npm test
```

It reads only `linkedin-posts/<slug>/post.md` and `article-drafts/<slug>/<slug>.md` under the folder, and refuses to run against a server that has LinkedIn credentials.
