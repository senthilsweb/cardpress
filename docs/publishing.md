# Publishing

Posts go to LinkedIn from the **Full preview** (the eye, or **Publish**, at the bottom of Details), now or at a time you choose. Articles are never published by the API (see [Post authoring](post-authoring.md)). A person confirms every post; nothing here is started by a chat or an agent.

## Publish or schedule

1. Write the post and open **Full preview**. Below the preview, **Publish now…** and **Schedule…** appear once LinkedIn is set up (an access token and an author URN in [Social accounts](social-settings.md)). Without them the bar offers **Set up LinkedIn**.
2. **Publish now…** asks a second time ("Post this to LinkedIn now?", naming the author). Only **Yes, publish now** sends.
3. **Schedule…** takes a date, a time and a time zone, and spells out the result ("Posts Dec 1, 2026, 9:30 AM EST (in 2 days)"). It must be at least a minute ahead and within a year.

What is sent is a **snapshot** taken at that moment: the text, the hashtags, the alt text, and the card rendered as a PNG at the LinkedIn size. Editing the draft or the card afterwards does not change a scheduled post. (To change it, cancel the job and schedule again.)

## What LinkedIn receives

Three calls, made by the server with the stored access token:

1. reserve an image upload (`POST /rest/images?action=initializeUpload`, owner = the author URN),
2. upload the image: the card as a PNG, or the post's own picture (only to a LinkedIn host; the token is never sent anywhere else). A post with a PDF or a video uses the document or video calls instead, described below,
3. create the post (`POST /rest/posts`): the text, the image and its alt text, public, main feed.

The text is the preview text with LinkedIn's markup characters escaped (`( ) [ ] { } < > @ | ~ _ * # \`), so it reads exactly as previewed. Hashtags go on a last line as LinkedIn hashtag templates, so they become real hashtags.

## Your own images or PDF in place of the card

In Details, under **Attachment**, choose **Use images or a PDF** and pick one file or several images. They go out with the post, not the card. The card design is kept: **Use the card** goes back to it.

| File | Limit | How LinkedIn shows it |
|---|---|---|
| Image: PNG or JPEG | 10 MB | One image, with your alt text |
| Several images: PNG or JPEG | 10 MB each, up to 10 (LinkedIn allows 20) | A grid, each image with its own alt text |
| Document: PDF | 20 MB (LinkedIn allows 100 MB and 300 pages; CardPress holds the file in memory, so its limit is lower) | Pages to swipe through, under the document title |

A document has a **title**, shown above its pages. It starts as the file name and can be changed. A document has no alt text.

With several images, the Attachment section lists them in order. Each has its own alt text, arrows to move it up or down, and a button to remove it. **Add images** adds more. One image left in the list is sent as an ordinary image post; removing the last one goes back to the card.

The full preview shows the image, the grid of images, or the PDF's pages in the browser's own viewer. The queue marks the post **Own image**, **N images** or **Document**.

Changing the file, the title, an image's alt text or the order of the images of an approved post returns it to draft, so it must be approved again: what was approved is what goes out. A post waiting to be sent cannot change its attachment; cancel it first.

For a document the server calls `POST /rest/documents?action=initializeUpload`, uploads the PDF to the address LinkedIn returns, and creates the post with the document and its title. The post is created straight after the upload: a member token cannot read a document's processing status, so CardPress does not wait for it.

For several images the server uploads each image in turn (`POST /rest/images?action=initializeUpload`, then the upload) and creates one post that names them all (`content.multiImage.images`, each with its `id` and `altText`). The images are read from the database one at a time, so they are never all in memory together, and the job gets 30 more seconds for each image.

## A video from a public address

Choose **Use a video** and paste a direct link to an MP4 that anyone can open. **CardPress takes no video upload from your computer and does not keep the video.** Only the address is stored, with the file's size.

| Rule | Limit |
|---|---|
| Address | `https` on the standard port, a public host, also after every redirect (at most 5). No user name or password in it. A page on a video sharing site is not a video file |
| File | MP4, from 75 KB to 500 MB (`CARDPRESS_VIDEO_MAX_MB` lowers the upper limit). LinkedIn also asks for 3 seconds to 30 minutes, which CardPress does not check |
| Server | It must state the file's size |

The address is checked when you add it (CardPress reads the first bytes) and the file is read again when the post is sent. If it no longer answers, is no longer an MP4, or has a different size, the post fails before anything is posted, and says why. A file replaced by another of exactly the same size is not noticed. The video has a **title**, which starts as the file name. The full preview plays the video from its address.

When the post is sent, the server:

1. opens the address,
2. reserves the upload (`POST /rest/videos?action=initializeUpload` with the size), which says how to cut the file into parts,
3. sends each part (`PUT` to the address given, a LinkedIn host only, without the access token), holding one part (about 4 MB) in memory and nothing on disk,
4. finishes the upload (`action=finalizeUpload` with the parts' ids),
5. asks every 5 seconds whether LinkedIn has processed the video, for at most 10 minutes,
6. creates the post.

If processing fails, the post fails. If it is still processing after 10 minutes, no post is created and it is marked **needs review**. LinkedIn's documentation does not say whether a member's token may read the processing status; if LinkedIn refuses that, CardPress waits 30 seconds and creates the post, which LinkedIn may refuse if the video is not ready.

One video is sent at a time, in the background, so other posts that are due do not wait for it. A video post has 45 minutes in all.

**You are responsible for having the right to post the video.**

| Route | Purpose |
|---|---|
| `PUT /api/v1/drafts/{id}/attachment?name=` | The file as the request body (PNG, JPEG or PDF). `name` is the file name, which a document's title starts from. Returns the draft |
| `PUT /api/v1/drafts/{id}/attachment/title` | `{"title": "…"}`: a document's title, one line of at most 150 characters |
| `GET /api/v1/drafts/{id}/attachment` | The file. `404` when the post uses the card |
| `DELETE /api/v1/drafts/{id}/attachment` | Back to the card (also removes a set of images) |
| `POST /api/v1/drafts/{id}/images` | Add an image (the request body) to the post's set. The first one turns the attachment into a set |
| `GET /api/v1/drafts/{id}/images/{image}` | One image of the set |
| `PUT /api/v1/drafts/{id}/images/{image}` | `{"altText": "…"}` |
| `PUT /api/v1/drafts/{id}/images/order` | `{"ids": [...]}`: every image once, in the new order |
| `DELETE /api/v1/drafts/{id}/images/{image}` | Remove one image |
| `PUT /api/v1/drafts/{id}/video` | `{"url": "https://…/video.mp4"}`: the post's video, by its public address. `PUT .../attachment/title` sets its title, `DELETE .../attachment` goes back to the card |

## What other networks accept

CardPress publishes to LinkedIn only. The previews for X, Instagram and Facebook follow what each network's developer documentation says one post can carry (checked 2026-11-25):

| Post carries | LinkedIn | X | Instagram | Facebook |
|---|---|---|---|---|
| The card | Yes | Yes | Yes | Yes |
| One image | Yes | Up to 5 MB | Up to 8 MB | Up to 10 MB |
| Several images | Up to 10 here | Up to 4, 5 MB each | Carousel up to 20, 8 MB each | Yes, 10 MB each |
| PDF | Yes | No | No | No |
| Video | Yes | Yes | Up to 300 MB | Yes |

With **Feed preview** on, a network that cannot take the post is struck through, cannot be selected, shows no preview and is left out of **All sizes**; the Attachment section says why, and its character count is hidden there. With Feed preview off, the canvas is the card itself, and every size can still be designed and downloaded.

Not checked: video length, image dimensions and aspect ratios (Instagram asks for 4:5 to 1.91:1), and file formats beyond the ones CardPress accepts (Instagram's publishing API takes JPEG only). Meta's pages do not mention documents at all, and X's help pages could not be read, so its figures come from its API documentation.

## Approve first

A post is only sent from an **approved** draft. The bottom of Details shows a draft's status and an **Approve** button; the Full preview offers the same button instead of Publish until it is approved. Approving is a deliberate step between writing and sending.

- **Any change** to an approved draft (its text, hashtags, alt text, title or card) puts it back to Draft, so what you approved is always what goes out. Saving the same content again changes nothing.
- While a post is **waiting** to be sent from a draft, the draft cannot be edited. Cancel the post in the queue first.
- A **posted** draft shows **Edit again**, which makes a new version you can approve and post again.
- The server enforces this, not only the screen: creating a job from a draft that is not approved is refused.
- Who may approve and publish depends on the person's role: an editor approves and publishes their own work, a writer only writes, and an admin approves and publishes anyone's. See [Accounts and roles](accounts.md).

Each draft keeps its **own card design**. Changing the card in the Design tab changes the open draft's card (and the brand's starting point for new drafts), and the card is saved with the draft.

## The queue

The **Publishing queue** section in Details lists posts with a small image, their time (in the zone you chose), and a status:

| Status | Meaning | What you can do |
|---|---|---|
| Scheduled | Waiting for its time | Publish now, Reschedule, Cancel |
| Publishing… | Being sent | Wait |
| Published | Done; shows **View on LinkedIn** and **Details**. It stays in the list as your record. | View, Details |
| Failed | LinkedIn or the network refused; **known not posted**. The reason is shown. | Publish again, Reschedule, Discard |
| Missed | The time passed while the server was not running (more than the grace window late) | Publish now, Reschedule, Discard |
| Check LinkedIn | The outcome is **unknown** (see below) | Open LinkedIn; Publish anyway (asks again, may duplicate); Discard |
| Cancelled | You cancelled it | Schedule again, Discard |

Buttons that would send a post ask twice: the first click changes the label to "Confirm…", and the second sends.

## Messages

A toast (bottom right) tells you what happened. **Sending to LinkedIn…** appears when you confirm; **Posted to LinkedIn**, with a **View post** button, when it is live; **LinkedIn did not post it** or **Check LinkedIn**, with the reason, when it is not. A post that was scheduled tells you the same when its time comes, as long as the studio is open.

## What is kept

Every post is saved in the database before it is sent, and stays: the text and hashtags exactly as confirmed, the image, when it was created, scheduled and posted (UTC), and LinkedIn's post id and link. The **Details** button on a post also shows each try: the three calls made to LinkedIn (reserve the image upload, upload the image, create the post), the status and time of each, LinkedIn's post id and request id, and whatever it said back. Tries are kept in `publish_attempts`, one row per trip, so a post you publish again after a failure shows both. The record never holds the access token, and an address with a signature in it is stored without the signature.

## No automatic retries

A failed post is **never retried by the server**. You fix the cause (a new token, say) and press **Publish again**. This is deliberate: LinkedIn has no way to say "do this only once", so a blind retry could post twice.

**Check LinkedIn** is used when the post may be live even though the server did not see a clean answer: the connection dropped or LinkedIn answered with a server error *while creating the post*, LinkedIn accepted it without returning an id, or the server stopped or hung mid-publish. Look at your LinkedIn feed. If it is there, Discard the job. If it is not, Publish anyway.

## The scheduler

A scheduler inside the Go process checks every 20 seconds. Each due post is claimed with a single atomic database update, so it runs at most once even if two servers share a database. Every time it runs:

- a post **within the grace window** (default 15 minutes, `CARDPRESS_MISSED_GRACE`) of its time is sent;
- a post **later than that** is marked Missed and waits for you, rather than appearing hours late;
- a publish that never finished (over 10 minutes) is flagged Check LinkedIn.

On start, any post left "publishing" by a previous run becomes **Check LinkedIn**.

**The server must be running at the scheduled time.** On a laptop that sleeps, scheduled posts will be missed; run the server (for example the Docker image) on a machine that stays on. Run a single instance: two can never double-post, but the start-up check assumes it is the only one.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `CARDPRESS_MISSED_GRACE` | `15m` | How late a scheduled post may still go out (1m to 24h) |
| `CARDPRESS_LINKEDIN_VERSION` | `202610` | The `LinkedIn-Version` header (`YYYYMM`). LinkedIn retires versions after about a year; if posts fail with "no longer accepts the API version", set this to a current one. |
| `CARDPRESS_LINKEDIN_API_BASE` | LinkedIn's API | For tests or a proxy only. It must be https (plain http only for localhost), because the access token is sent there. |

## API

| Request | Purpose |
|---|---|
| `POST /api/v1/publish/jobs` | Multipart: `meta` (JSON: `profileId`, `draftId`, `body`, `hashtags`, `altText`, and for later `scheduledAt` + `timezone`) and `image` (the card as a PNG; leave it out when the post has a file of its own, which the server sends instead). Publish-now jobs return at once and run in the background. |
| `GET /api/v1/publish/jobs?profileId=` | The list (no images) |
| `GET /api/v1/publish/jobs/{id}`, `/image` and `/attempts` | One job, its PNG, and what LinkedIn answered on each try |
| `POST /api/v1/publish/jobs/{id}/publish-now` | `{"acceptDuplicate": true}` is required for a Check LinkedIn job |
| `PUT /api/v1/publish/jobs/{id}/schedule` | `{"scheduledAt", "timezone"}` |
| `POST /api/v1/publish/jobs/{id}/cancel` and `DELETE /api/v1/publish/jobs/{id}` | Cancel a scheduled job; delete a finished one |

Code: `internal/linkedin` (the calls and the text escaping), `internal/service/publish.go` (jobs, states, scheduler), `web/src/components/studio/PublishBar.tsx` and `JobQueue.tsx`.
