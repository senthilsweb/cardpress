# Publishing

Posts go to LinkedIn from the **Full preview** of the Post tab, now or at a time you choose. Articles are never published by the API (see [Post authoring](post-authoring.md)). A person confirms every post; nothing here is started by a chat or an agent.

## Publish or schedule

1. Write the post and open **Full preview**. Below the preview, **Publish now…** and **Schedule…** appear once LinkedIn is set up (an access token and an author URN in [Social accounts](social-settings.md)). Without them the bar offers **Set up LinkedIn**.
2. **Publish now…** asks a second time ("Post this to LinkedIn now?", naming the author). Only **Yes, publish now** sends.
3. **Schedule…** takes a date, a time and a time zone, and spells out the result ("Posts Dec 1, 2026, 9:30 AM EST (in 2 days)"). It must be at least a minute ahead and within a year.

What is sent is a **snapshot** taken at that moment: the text, the hashtags, the alt text, and the card rendered as a PNG at the LinkedIn size. Editing the draft or the card afterwards does not change a scheduled post. (To change it, cancel the job and schedule again.)

## What LinkedIn receives

Three calls, made by the server with the stored access token:

1. reserve an image upload (`POST /rest/images?action=initializeUpload`, owner = the author URN),
2. upload the PNG (only to a LinkedIn host; the token is never sent anywhere else),
3. create the post (`POST /rest/posts`): the text, the image and its alt text, public, main feed.

The text is the preview text with LinkedIn's markup characters escaped (`( ) [ ] { } < > @ | ~ _ * # \`), so it reads exactly as previewed. Hashtags go on a last line as LinkedIn hashtag templates, so they become real hashtags.

## The queue

The **Publishing queue** section of the Post tab lists posts with a small image, their time (in the zone you chose), and a status:

| Status | Meaning | What you can do |
|---|---|---|
| Scheduled | Waiting for its time | Publish now, Reschedule, Cancel |
| Publishing… | Being sent | Wait |
| Published | Done; shows **View on LinkedIn** | Remove from the list (the post stays on LinkedIn) |
| Failed | LinkedIn or the network refused; **known not posted**. The reason is shown. | Publish again, Reschedule, Discard |
| Missed | The time passed while the server was not running (more than the grace window late) | Publish now, Reschedule, Discard |
| Check LinkedIn | The outcome is **unknown** (see below) | Open LinkedIn; Publish anyway (asks again, may duplicate); Discard |
| Cancelled | You cancelled it | Schedule again, Discard |

Buttons that would send a post ask twice: the first click changes the label to "Confirm…", and the second sends.

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
| `CARDPRESS_LINKEDIN_VERSION` | `202610` | The `LinkedIn-Version` header. LinkedIn retires versions after about a year, so keep it current. |
| `CARDPRESS_LINKEDIN_API_BASE` | LinkedIn's API | For tests or a proxy only. It must be https (plain http only for localhost), because the access token is sent there. |

## API

| Request | Purpose |
|---|---|
| `POST /api/v1/publish/jobs` | Multipart: `meta` (JSON: `profileId`, `draftId`, `body`, `hashtags`, `altText`, and for later `scheduledAt` + `timezone`) and `image` (PNG). Publish-now jobs return at once and run in the background. |
| `GET /api/v1/publish/jobs?profileId=` | The list (no images) |
| `GET /api/v1/publish/jobs/{id}` and `/image` | One job, and its PNG |
| `POST /api/v1/publish/jobs/{id}/publish-now` | `{"acceptDuplicate": true}` is required for a Check LinkedIn job |
| `PUT /api/v1/publish/jobs/{id}/schedule` | `{"scheduledAt", "timezone"}` |
| `POST /api/v1/publish/jobs/{id}/cancel` and `DELETE /api/v1/publish/jobs/{id}` | Cancel a scheduled job; delete a finished one |

Code: `internal/linkedin` (the calls and the text escaping), `internal/service/publish.go` (jobs, states, scheduler), `web/src/components/studio/PublishBar.tsx` and `JobQueue.tsx`.
