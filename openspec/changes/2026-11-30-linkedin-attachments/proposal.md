# LinkedIn attachments: your own image, several images, a document, a video

**Status:** Proposed. Nothing is built. LinkedIn's calls and limits named here are from memory and must be confirmed against its current documentation before each bolt.

## Why
A LinkedIn post from CardPress always carries the designed card: one PNG. There is no way to post a photo, a set of images, a PDF that people swipe through, or a video. Those are the formats most posts use, and a document is the usual way to get a carousel on a member's post.

## What changes
1. **An attachment choice on a post.** The Post tab gets **Attachment**: Card (as today, the default), Image, Images, Document, Video. Anything but Card replaces the card for that post only. The card design is kept, so switching back to Card loses nothing.
2. **Image.** One picture of your own (PNG or JPEG) in place of the card. It uses the upload path that exists today.
3. **Images.** Two or more pictures, in an order you set, each with its own alt text. LinkedIn shows them as a grid.
4. **Document.** One PDF with a title. LinkedIn shows it as a swipeable carousel. A later step can build the PDF from several cards; this change only takes a file you give it.
5. **Video, from a public address only.** You paste the web address of a video file that anyone can open. The server fetches it and passes it to LinkedIn. **CardPress has no video upload from your computer and does not keep the video.** Only the address is stored.
6. **Preview and queue.** The full preview shows the chosen attachment as LinkedIn would. The publishing queue says which kind each post carries.
7. **The rules that do not change.** A person confirms every post. Nothing is retried automatically. An unclear outcome stays "needs review". What was approved is what goes out: changing the attachment of an approved post returns it to draft.

## How it works
- **Where files are kept.** Pictures and documents are stored once by content hash (`doc_blobs`, as article pictures are), not inside the job row. A job points at them, so a post scheduled for later sends exactly the files that were approved.
- **Video is fetched when the post is sent**, not when it is scheduled. The address is checked when you paste it (it answers, it is a video, its size is within the limit) and again at send time. If it has gone or changed type by then, the post fails before anything is posted and says why.
- **Fetching is guarded.** The video fetch uses the same guard as the article fetcher (`internal/source/guard.go`): public addresses only, no private or loopback hosts on any redirect, a redirect limit, a size limit, a time limit. Only `https`.
- **Nothing large is held in memory.** Documents and videos are streamed to LinkedIn in parts, with a temporary file on disk when a part must be re-read. A 256 MB machine must be able to send the largest allowed video.
- **A video is not ready at once.** LinkedIn processes a video after upload. The job gains a waiting state; the post is created when LinkedIn says the video is ready, within a time limit. If the limit passes, the job becomes "needs review" and is not retried.
- **Limits.** Each kind has a size limit and a count limit, set to LinkedIn's or lower, with an environment variable to lower them further.

## Bolts (build order)
1. **Own image.** Attachment choice, file picker, JPEG as well as PNG, preview, queue label.
2. **Document.** PDF upload with a title, blob storage, streaming upload, preview of the pages.
3. **Images.** Several pictures, order, alt text each, multi-image post.
4. **Video from a public address.** Address check, guarded streaming fetch, upload in parts, the waiting state.

Each bolt ends with one real post of that kind on a real account before the next starts.

## Out of scope
- Uploading a video from your computer, and storing video in CardPress.
- Video addresses that need a sign-in, and video pages on sharing sites (only a direct link to a video file).
- Building a carousel PDF from several cards (a follow-up to bolt 2).
- LinkedIn's sponsored carousel format, polls, and articles with attachments.
- X, Instagram and Facebook publishing.

## Decisions (taken, change if you disagree)
- Video comes only from a public `https` address, fetched at send time and never stored.
- One attachment kind per post.
- The card stays the default, and choosing another attachment does not delete the card.
- Thumbnails and captions for video are left to LinkedIn's defaults in the first version.

## Open questions
- LinkedIn's exact calls, size and count limits for documents, multi-image posts and video (confirm before building).
- Whether the video owner's permission needs any wording in the editor: the person posting is responsible for having the right to post it.
- Whether a scheduled video post should check the address again a few minutes before its time and warn if it has gone.
