# Design

## What Turso offers (from docs.turso.tech, read 2026-11-25)
- Vector column types are part of the column type: `F32_BLOB(D)` (4·D bytes, "a good starting point"), `F16_BLOB`, `FB16_BLOB`, `F8_BLOB`, `F1BIT_BLOB`, `F64_BLOB`; up to 65,536 dimensions.
- `vector32('[…]')` makes a vector from JSON; `vector_extract` reads it back; `vector_distance_cos` returns cosine distance, 0 (same) to 2 (opposite).
- A DiskANN index: `CREATE INDEX … ON t (libsql_vector_idx(embedding, 'metric=cosine'))`, with optional `compress_neighbors`, `max_neighbors` (default 3·√D), `search_l`, `insert_l`. It is queried explicitly: `vector_top_k('idx', vector32(?), k)` returns rowids to join on. The index works on a table with a rowid or a single-column primary key.
- Their reference model is a `movies` table with `embedding F32_BLOB(4)`, searched with `vector_top_k(...) JOIN movies ON movies.rowid = id`. The table below follows it.
- Turso names no embedding model. Its examples use 4-dimensional toy vectors.
- The newer Turso database engine (the rewrite) documents vector functions with linear scan only and no `libsql_vector_idx`. Turso Cloud and libSQL servers today have the index. This design uses only the functions both share for writing, and the index only where it exists.

## Where it works
| Database | Vectors stored | Ranking |
|---|---|---|
| Turso / libSQL server (`libsql://`, `https://`) | `F32_BLOB(1024)` | `vector_top_k` on the DiskANN index, exact `vector_distance_cos` on the candidates |
| Local SQLite file (`file:`; the Fly demo) | the same bytes (little-endian float32; `F32_BLOB` is plain BLOB to SQLite) | in Go, cosine over the brand's rows. Fine for thousands of passages |

The index is created at start-up only on libSQL, never in a migration, so the same migration runs on both. One store function hides the difference, so search code does not care.

## Model and size
- Anthropic has no embedding model and points to Voyage AI. Default: **`voyage-3.5-lite`, 1024 dimensions, float**. It is cheap, handles 32,000 tokens per input, and can return 256, 512, 1024 or 2048 dimensions. Check the current Voyage model list when building, and pick the newest model of this tier.
- **1024 × float32 = 4 KB a passage.** 1,000 articles of 10 passages is about 40 MB with the index, which is acceptable on Turso and on the demo volume. 512 dimensions halves it at a small loss; `F8_BLOB` or index `compress_neighbors=float8` are the next steps if size matters.
- Documents use `input_type: document`; later searches use `query`.
- Metric: cosine.
- Settings: `CARDPRESS_EMBED` (`off` | `voyage`, default off), `VOYAGE_API_KEY`, `CARDPRESS_EMBED_MODEL`, `CARDPRESS_EMBED_DIMENSIONS`. The dimension is fixed by the column. Changing the model or dimension re-embeds everything, and a start-up check refuses a mismatch.

## What is embedded
- **Post:** one passage: the text, hashtags and card headline.
- **Article:** a first passage of title, summary and headline, then the body split at headings and paragraphs into passages of about 300 to 500 words, overlapping by one paragraph. Each passage is prefixed with the article's title so it stands alone.
- With the content schema, a field marked `x-embed` (title, summary, headline, body, hashtags, topic, audience) is included. Review notes never are.

## Storage
Migration `0026_embeddings`:
```sql
CREATE TABLE embeddings (
  id          INTEGER PRIMARY KEY,          -- rowid, for vector_top_k
  draft_id    TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  profile_id  TEXT NOT NULL,                -- brand, for narrowing
  kind        TEXT NOT NULL,                -- post | article
  version     INTEGER NOT NULL,             -- the published version
  passage     INTEGER NOT NULL,             -- 0, 1, 2 …
  text        TEXT NOT NULL,                -- what was embedded
  model       TEXT NOT NULL,
  embedding   F32_BLOB(1024) NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE (draft_id, passage)
);
CREATE INDEX embeddings_profile ON embeddings (profile_id);
-- libSQL only, at start-up:
-- CREATE INDEX IF NOT EXISTS embeddings_vec ON embeddings (libsql_vector_idx(embedding, 'metric=cosine'));
```
`drafts` gains `embedded_version` and `embed_error`, so the Library can show "not indexed" and a retry can find what is behind.

## When it runs
- After a post's job is marked published, or after `PublishPage` succeeds, a background worker embeds that version, replacing the item's rows in one transaction.
- Failures (no key, service down, rate limit) set `embed_error`. The worker retries with backoff, and catches up at start-up on items whose `embedded_version` is behind.
- A command `cardpress embed --all` fills in items published before this change. It asks nothing and only reads published versions.
- Back to draft: the rows are removed, so search finds only what is published now (decided by the owner on 2026-11-26). Delete, of an item or a brand: removed explicitly, not left to the cascade.

## The query a later search will use (for the record)
```sql
SELECT e.draft_id, e.passage, vector_distance_cos(e.embedding, vector32(?)) AS distance
FROM vector_top_k('embeddings_vec', vector32(?), 50) AS t
JOIN embeddings e ON e.id = t.id
WHERE e.profile_id IN (…)
ORDER BY distance LIMIT 10;
```
`vector_top_k` finds nearest neighbours before the brand filter, so asking for more (50) and then filtering keeps results for a small brand. Items are ranked by their closest passage.

## Telemetry
A span per embedding call with model, passages and tokens, never the text.
