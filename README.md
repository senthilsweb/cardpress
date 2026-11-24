# CardPress

> Open-source, self-hosted agentic AI for social media authoring and management: design branded cards, draft posts with an assistant, preview them, then publish or schedule. One Go binary with the web app embedded.

![CardPress: design a card, draft a post with the assistant, preview it](docs/media/cardpress-demo.gif)

**Docs: [senthilsweb.com/cardpress](https://www.senthilsweb.com/cardpress/)**

## Status

| Area | State |
|---|---|
| Card designer, post composer, full preview, exports | Built and tested |
| Encrypted credentials, scheduler | Built and tested |
| LinkedIn publishing | Tested against a local fake of LinkedIn's API, **not yet against a real account**. Treat the first real post as a trial |
| X and Instagram | Credentials can be stored; publishing is not built |
| Assistant | Works with a built-in demo agent (no AI model). The Claude Managed Agent adapter is built and tested against a fake API, **not yet against a real Anthropic account** |
| MCP server | Built and tested |

## What it does

- **Cards**: one brand profile, 28 colour sets, 6 layouts, 12 backgrounds drawn in code, and 10 sizes for LinkedIn, X, Instagram and Facebook. Export a PNG, copy it, or download every size as a zip.
- **Posts**: a rich-text editor with hashtags and alt text, and a full preview of the LinkedIn feed.
- **Assistant**: paste an article or a web address and it proposes a post. You approve, edit or reject it. It prepares content only.
- **Publish**: post to LinkedIn now or at a chosen time, with a queue, per-post status and no automatic retries. A person confirms every post.
- **MCP**: an outside agent can read drafts and propose content, never publish. Every call is audited.

Everything you save lives on your server (SQLite, or Turso); nothing is kept in the browser. Credentials are encrypted.

## Run it

```bash
# One binary (needs Go 1.26+ and Node 22+ to build)
make build
./bin/cardpress                 # http://localhost:8080  (the editor is at /studio/)

# Docker Compose (SQLite in a volume, settings from .env)
cp .env.example .env
docker compose up -d

# Development (Go API on :8080, Astro with hot reload)
cd web && npm install && cd ..
make dev
```

It listens on loopback only and refuses to expose the API without `CARDPRESS_API_TOKEN`. To use a real model for the assistant, see [Claude Managed Agent](docs/cma-agent.md).

## Documentation

The docs are in [`docs/`](docs/index.md) and published as a site (MkDocs Material, built by `.github/workflows/docs.yml`). Start with [Getting Started](docs/getting-started.md), or see [Configuration](docs/configuration.md), [Deployment](docs/deployment.md), [Architecture](docs/architecture.md) and the [Code Tour](docs/code-tour.md). To preview the site locally:

```bash
pip install "mkdocs-material==9.*" "mkdocs<2"
mkdocs serve
```

## Stack

Astro (static) with a React island, shadcn/ui on Tailwind CSS v4, a Go server with the built site embedded, SQLite or Turso/libSQL, and self-hosted fonts. Details are in the [Architecture](docs/architecture.md).

## Contributing

`make test` runs the Go tests (with `-race`), the web type check and the unit tests. Work is proposed in [`openspec/changes`](openspec/changes) and recorded in the [AI-DLC record](docs/ai-dlc/README.md).

## Licence

MIT
