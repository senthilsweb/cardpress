# Tasks

## Before any bolt
- [ ] Confirm against LinkedIn's documentation: the upload calls, post payloads, size and count limits for image, multi-image, document and video
- [ ] Data model: an attachment kind on a draft and a job; job files as references to `doc_blobs`; migration

## Bolt 1: own image
- [x] Attachment choice in the Post tab (card by default); file picker; PNG and JPEG; 10 MB limit
- [x] Server stores the picture with the draft, checks its type by its first bytes, and sends it in place of the card; changing it returns an approved post to draft
- [x] Full preview shows the picture; the queue marks the post "Own image"
- [x] Tests against the fake LinkedIn; docs (`docs/publishing.md`, `docs/data-model.md`, `docs/reference.md`)
- [x] Confirmed against LinkedIn's documentation: the image upload takes JPG, GIF and PNG, under 36,152,320 pixels (the pixel limit is not checked by CardPress)
- [ ] One real post
- [ ] Not done: the picture is kept in the draft row, not in `doc_blobs` (that comes with documents); the version history does not record it; the library and the public page still show the card

## Bolt 2: document
- [x] Confirmed against LinkedIn's documentation: `POST /rest/documents?action=initializeUpload`, upload to `uploadUrl`, post with `content.media` `{title, id}`; PDF, PPT, PPTX, DOC, DOCX; 100 MB and 300 pages
- [x] PDF upload with a title (starts as the file name, editable); 20 MB limit; type checked by its first bytes
- [x] Document upload to LinkedIn and document post; no alt text
- [x] Preview of the pages in the browser's own PDF viewer; the queue marks the post "Document"
- [x] Tests (service, API, LinkedIn client against the fake); docs
- [ ] One real post
- [ ] Not done, and different from the proposal: the PDF is held in memory and kept in the draft and job rows (hence the 20 MB limit), not streamed and not in `doc_blobs`. The page count is not checked. Only PDF is accepted. The post is created without waiting for LinkedIn to process the document (a member token cannot read the status); whether LinkedIn accepts that is unknown until a real post

## Bolt 3: images
- [x] Confirmed against LinkedIn's documentation: `content.multiImage.images` with `id` and `altText` each; 2 to 20 images; each uploaded through the Images API
- [x] Several pictures with an order and alt text each; at most 10, 10 MB each
- [x] Multi-image post; each picture uploaded in turn and read from the database when it is its turn
- [x] One picture left in a set is sent as an ordinary image post; none goes back to the card
- [x] Preview as a grid; the queue shows how many
- [x] Tests (service, API, LinkedIn client against the fake); docs
- [ ] One real post
- [ ] Not done: reordering is by arrows, not by dragging; the version history does not record the pictures; the library and the public page still show the card

## Bolt 4: video from a public address
- [ ] Address field; check on paste (https, public host, answers, is a video, size within the limit)
- [ ] Guarded streaming fetch at send time (shared guard with `internal/source`), no storage, bounded memory
- [ ] Upload in parts; waiting state until LinkedIn has processed it; time limit; "needs review" when unclear
- [ ] A failure before anything is posted says what was wrong with the address
- [ ] Memory check: the largest allowed video on a 256 MB machine
- [ ] Tests (fake LinkedIn, fake video host, private-address and redirect refusals), docs, one real post
