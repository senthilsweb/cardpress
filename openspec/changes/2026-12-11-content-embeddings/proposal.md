# Published posts and articles as vector embeddings

**Status:** deferred (owner, 2026-11-27); proposed by the owner on 2026-11-25. Specification only: nothing is built. Searching and ranking by meaning is a later change that uses what this one stores.

## Why
Finding earlier work today means matching words in a title. The owner wants to search by meaning and rank by closeness, for people ("what have we said about data contracts?") and for the agents (avoid repeating a published post, link related articles). That needs each published item stored as vectors.

## What changes
- When an item is **published** (a post sent to LinkedIn, or an article's public page put up), its text is turned into embeddings and stored in the database, in Turso's native vector type.
- Articles are split into passages; a post is one passage. Each passage has its own vector.
- Embedding happens after publishing, in the background. Publishing never waits for it or fails because of it; a failed embedding is retried.
- Taking an item back to draft removes its vectors; publishing again creates them. Deleting the record or its brand deletes them.
- The model, the number of dimensions and the provider key are settings. With no key set, nothing is embedded and nothing else changes.

## Rules that stay
- Only published text is embedded. Drafts, review notes and chats are not.
- Vectors carry the item's brand, so a later search only sees the brands the person may see.
- Published text is already public, but it is still sent to an outside embedding service: the docs say so, and the setting is off by default.

## Out of scope
The search page, the search tool for agents, embedding drafts, images and attachments, and hybrid word-plus-meaning ranking. These are written up when search is specified.
