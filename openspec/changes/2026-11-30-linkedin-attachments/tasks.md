# Tasks

## Before any bolt
- [ ] Confirm against LinkedIn's documentation: the upload calls, post payloads, size and count limits for image, multi-image, document and video
- [ ] Data model: an attachment kind on a draft and a job; job files as references to `doc_blobs`; migration

## Bolt 1: own image
- [x] Attachment choice in the Post tab (card by default); file picker; PNG and JPEG; 10 MB limit
- [x] Server stores the picture with the draft, checks its type by its first bytes, and sends it in place of the card; changing it returns an approved post to draft
- [x] Full preview shows the picture; the queue marks the post "Own image"
- [x] Tests against the fake LinkedIn; docs (`docs/publishing.md`, `docs/data-model.md`, `docs/reference.md`)
- [ ] Confirm against LinkedIn's documentation that the image upload takes a JPEG (assumed)
- [ ] One real post
- [ ] Not done: the picture is kept in the draft row, not in `doc_blobs` (that comes with documents); the version history does not record it; the library and the public page still show the card

## Bolt 2: document
- [ ] PDF upload with a title; stored once by hash; size and page limits
- [ ] Streaming document upload to LinkedIn; document post
- [ ] Preview of the pages
- [ ] Tests, docs, one real post

## Bolt 3: images
- [ ] Several pictures with order and alt text each; count limit
- [ ] Multi-image post
- [ ] Preview as a grid
- [ ] Tests, docs, one real post

## Bolt 4: video from a public address
- [ ] Address field; check on paste (https, public host, answers, is a video, size within the limit)
- [ ] Guarded streaming fetch at send time (shared guard with `internal/source`), no storage, bounded memory
- [ ] Upload in parts; waiting state until LinkedIn has processed it; time limit; "needs review" when unclear
- [ ] A failure before anything is posted says what was wrong with the address
- [ ] Memory check: the largest allowed video on a 256 MB machine
- [ ] Tests (fake LinkedIn, fake video host, private-address and redirect refusals), docs, one real post
