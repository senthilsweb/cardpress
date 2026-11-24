# Getting Started

At the end you will have CardPress running on your machine and a first card designed.

## Prerequisites

- To run a release binary or the Docker image: nothing else.
- To build from source: Go 1.26+ and Node 22+.

## Run it

**From source** (one binary, no Docker):

```bash
git clone https://github.com/senthilsweb/cardpress.git
cd cardpress
make build                 # builds web/dist and bin/cardpress
./bin/cardpress            # http://localhost:8080
```

**With Docker Compose**:

```bash
cp .env.example .env       # edit it; see Configuration
docker compose up -d       # http://localhost:8080
```

The server listens on `127.0.0.1` only. Open <http://localhost:8080> for the landing page and click **Open editor** (or go straight to `/studio/`). The first time, you are asked to **create the admin account** (your name, email and a password); it becomes the admin and keeps anything already saved. After that, the app opens at a sign-in page, and others can use **Create an account** (an editor by default). See [Accounts and roles](accounts.md). Your data is saved in `data/cardpress.db`.

## Design a card

1. In **Design**, pick a **Layout**, a **Background** and a **Colours** set.
2. In **Text**, type the eyebrow, title, subtitle and footers. The card updates as you type.
3. Choose a size in the bar above the canvas (LinkedIn, X, Instagram, Facebook), or **All sizes** to see them together.
4. **Download PNG**, **Copy** the image, or **All sizes .zip**.

Set your name, handle, logo and fonts once in the **Profile** tab.

## Write a post

1. Open the **Assistant** (the sparkle button in the header), paste an article or a web address, and press **Draft from this**.
2. Read the proposal. **Approve and use** copies it into a draft, **Edit** changes it first, **Reject** dismisses it.
3. In **Post**, refine the text, hashtags and alt text. **Full preview** shows the LinkedIn feed as it will look.

The default assistant is a built-in demo, not an AI model. To use a real one, see [Claude Managed Agent](cma-agent.md).

## Publish

Publishing to LinkedIn needs a token. Add it under **Social accounts**, in the account menu at the bottom left of the sidebar; see [Social accounts](social-settings.md) and [Publishing](publishing.md). Until then you can copy the post text and image into LinkedIn yourself.

## Next

- Run it on a server: [Deployment](deployment.md) and [Configuration](configuration.md).
- Develop on it: `make dev` runs the Go API on :8080 and the Astro dev server with hot reload; see [Code Tour](code-tour.md).
