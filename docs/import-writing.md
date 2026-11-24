# Loading your own writing

`scripts/import-register/` loads posts and articles from a folder of Markdown into a running CardPress, so the library, the editor and the approval flow can be tried with real writing. It posts through the API, so everything goes through the same checks as the editor. **Nothing from your folder is copied into this repository.**

```sh
cd scripts/import-register
npm install
node import.mjs --register ~/path/to/folder --server http://127.0.0.1:8080
```

| Option | Default | Meaning |
|---|---|---|
| `--register` | (required) | The folder to read |
| `--server` | `http://127.0.0.1:8080` | A running CardPress |
| `--brand` | the open brand | The brand to add to |
| `--posts`, `--articles` | 10, 6 | How many of each, spread evenly across what is found |
| `--approve-every` | 3 | Approve every Nth item (0 for none) |
| `--dry-run` | | List what would be added |
| `--token` | `CARDPRESS_API_TOKEN` | If the server needs one |

## What it reads

Only two places under the folder, and only what they name:

- `linkedin-posts/<slug>/post.md`: the first variant ("## Variant …") is the post's text, and its closing hashtag line becomes the hashtags.
- `article-drafts/<slug>/<slug>.md`: front matter (`title`, `description`, `category`) and Markdown. Headings, paragraphs, bold, italic, code, links, lists, quotes, code blocks, dividers and tables become the editor's document. Pictures next to the article are shrunk to 1600 px and embedded as base64, so the whole article is one row in the database.

Nothing else in the folder is opened, and an image path that leaves the article's own folder is ignored.

## What it makes

Every item is a **draft** with its own **card design** taken from the editor's catalogue. Layout, background and colour set differ from item to item (posts rotate through hero, centred, split and quote; articles use the cover layout), so the library shows variety. About one in three is approved. Nothing is scheduled or sent.

It refuses to run against a server that has LinkedIn credentials for the brand, so a test set can never be published by accident. Use an empty database (`-db file:/tmp/test.db`). Running it again skips items whose title is already there.

## Tests

`npm test` in the folder runs the Markdown-to-document converter on small inline examples.
