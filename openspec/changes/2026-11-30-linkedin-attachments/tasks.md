# Tasks

## Before any bolt
- [ ] Confirm against LinkedIn's documentation: the upload calls, post payloads, size and count limits for image, multi-image, document and video
- [ ] Data model: an attachment kind on a draft and a job; job files as references to `doc_blobs`; migration

## Bolt 1: own image
- [ ] Attachment choice in the Post tab (Card default); file picker; PNG and JPEG; size limit
- [ ] Server accepts JPEG and the attachment kind; changing the attachment of an approved post returns it to draft
- [ ] Full preview and queue label show the kind
- [ ] Tests against the fake LinkedIn; docs (`docs/publishing.md`, `docs/post-authoring.md`)
- [ ] One real post

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
