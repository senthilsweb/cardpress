# Tasks

2026-11-28: the live site has published four card posts (2026-11-25 to 11-27, no errors, from the day's backup). Own image, document, several images
and video were not among them; the owner will try these later.


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
- [x] Confirmed against LinkedIn's documentation: initializeUpload (size) → PUT each part → finalizeUpload (part ids) → status → post with `content.media` `{title, id}`; MP4. It gives two size limits (500 MB and 5 GB; CardPress uses 500 MB), and does not say whether a member token can read the status or whether the upload address needs the token (not sent)
- [x] Address field; check on entry (https, public host also after redirects, answers, MP4 by its first bytes, size known and within the limit)
- [x] Guarded streaming fetch at send time (same address guard as articles), no storage, one part in memory; a changed size is refused
- [x] Upload in parts; wait for processing (10 minutes), then "needs review"; fixed 30 s wait when the status cannot be read
- [x] One video at a time, in the background, marked alive so it is not taken for a hung publish
- [x] A failure before anything is posted says what was wrong with the address
- [x] Tests (fake LinkedIn, test video host, private-address and redirect refusals), docs
- [ ] Memory check: the largest allowed video on a 256 MB machine (by design one part is held; not measured)
- [ ] A real public video address, and one real post
- [ ] Not done: the waiting for processing is inside the "publishing" state, not a job state of its own; duration is not checked; no thumbnail or captions; the library shows no picture for a video job

## Other networks (previews only)
- [x] Rules per network from X's and Meta's developer documentation (`web/src/lib/media.ts`)
- [x] Feed preview shows the post's own file; a network that cannot take it is not selectable and has no preview; the editor says why
- [ ] Not done: video length, image dimensions and aspect ratio are not checked; publishing to these networks is not built
