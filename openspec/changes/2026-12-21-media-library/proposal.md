# Media library, per brand

**Status:** part 1 built (storage, API, the Media page), not deployed. Part 2 (choosing from the library, `asset:`
references) is not built. Asked for by the owner on 2026-11-26.

## Why
Pictures are uploaded again for every card and stored inside each card's design. A brand needs one place for its logos,
photos and documents.

## Decisions (the owner's)
- Everything is stored in the SQLite database: nothing else to deploy.
- A video is only a public web address; no video file is stored.

## What changes
- **Library of assets per brand**: images (PNG, JPEG, WebP), PDF documents, and video links (https).
- A page listing them with search, tags, type filter, grid and list; upload by choosing or dropping files.
- Anywhere a file is chosen today (card photos, screenshot, background image, logo, headshot, post images and PDF)
  offers **Upload** or **From library**.

## Storage
| Table | Holds |
|---|---|
| `assets` | brand, kind, name, type, size, width, height, tags, link (video), content hash, who and when |
| `asset_blobs` | each distinct file once, keyed by hash, with a small thumbnail |

- A card refers to an asset (`asset:<id>`) and no longer copies its bytes. Older cards keep their embedded pictures.
- A post waiting or sent keeps its own copy, as today, so later changes to the library do not alter it.
- An asset in use cannot be deleted; the message says where it is used.
- Access follows the brand: its owner and admins.

## Limits
The server has 256 MB of memory and a 1 GB disk, and a file is read whole from the database.

| Item | Limit |
|---|---|
| Image | 10 MB; reduced to at most 2,400 px on upload |
| PDF | 20 MB |
| One brand | 200 MB (setting) |
| Total | A warning at 70% of the disk |

SVG files are refused for now: they can carry scripts. Lists load thumbnails only.

## Decided while building
- **The browser reduces a picture and draws its thumbnail.** The server only reads the size from the file's header and
  refuses anything over the limits, so a small machine never unpacks a large picture. One upload is taken in at a time.
- A **JPEG is always drawn again**, which drops the photo's own data, such as where it was taken. A PNG or WebP that
  already fits is stored as it is.
- A thumbnail belongs to the **entry**, not to the shared file, so one brand's upload never decides what another sees.
- A brand holds a file once; adding it again names the entry that has it.
- A file's type is read from its bytes. Files are sent as downloads, with nothing in them allowed to run.
- The page is **Library → Media**. The allowance is `CARDPRESS_MEDIA_BRAND_MB`, 200 by default.

## Consequences
The database file and its backups grow with the files. If a brand library outgrows the disk, the disk is enlarged;
object storage is a later change.

## Out of scope
Video files, folders, image editing, sharing between brands, assistant access.
