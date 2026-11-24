# Post authoring

The **Post** tab is where you write the text that goes with a card. Everything is saved on the server as a *draft*; you can keep several and switch between them from the Draft menu.

## Post or article

| | Post | Article |
|---|---|---|
| Editor | Paragraphs, bulleted and numbered lists, bold, italic | Adds headings, quotes and links |
| Extras | Hashtags, image alt text, Unicode styles option | none |
| Leaves the app by | Publish or schedule to LinkedIn ([Publishing](publishing.md)), or **Copy text** | **Copy formatted** (HTML and plain text) |

LinkedIn's API cannot publish native long-form articles, so an article is written here and pasted into LinkedIn's article editor or a blog. Switching an article to a post simplifies it: headings, quotes and code become paragraphs and links keep only their text. Nothing else is lost.

## What LinkedIn does not support

LinkedIn posts are plain text. There is no bold, italic, headings or link text. The composer lets you write with them anyway, then **serializes** the document to what LinkedIn will receive:

- Paragraphs are separated by a blank line. Line breaks inside a paragraph stay single.
- Lists become lines starting with `•` or `1.`, indented two spaces per level.
- Hashtags are added as the last line, `#One #Two`.
- Links are written out as plain URLs.
- **Bold and italic are left out by default.** Turn on *Keep bold and italic (Unicode)* to send them as look-alike characters instead. Screen readers may read those letter by letter and search will not match them, so use it sparingly.

Mentions (`@name`) are not supported: LinkedIn needs a member ID for each one.

## Writing in a larger view

The sidebar is narrow, so there are two ways to get more room. You can **drag the bottom-right corner** of the editor to make it taller or shorter (the height is remembered). Or use the **expand** button (top right of the Post text section), which opens the editor over the centre of the studio on a plain page, with Copy, Full preview and Collapse in its header. The sidebar stays visible, so hashtags, alt text and options are still there. **Esc** or **Collapse** returns to the studio, and so does switching to another tab. Expanding recreates the editor, so undo history starts fresh; your text is not affected.

## Limits and the "see more" cut

- A post is limited to **3,000 characters**, counted as characters (an emoji counts as one). The hashtag line counts. Over the limit, the count turns amber and the full preview warns.
- The feed shows only the first **about 3 lines or 210 characters**, then "…see more". Put the point first. These numbers vary by device, so treat them as a guide.

## Full preview

**Full preview** shows exactly what would be sent: the serialized text in a LinkedIn-style frame with the card image, with a working "…see more", the character count, and checks for the length limit, the "see more" cut, missing alt text and any formatting that will be dropped or rewritten. For an article it shows the formatted result.

Publishing and scheduling are reached only from this preview, so what you confirm is what is sent. See [Publishing](publishing.md).

## Where it is stored

Drafts are rows in the `drafts` table (`internal/store/migrations/0002_drafts.sql`) and are served at `/api/v1/drafts`. The document is TipTap/ProseMirror JSON. The card design is not part of a draft: it is the profile's working design, shown on the canvas.

The caption field from the earlier version is copied into the first draft the first time the studio loads, and is not used afterwards.

## Code map

| File | What it does |
|---|---|
| `web/src/lib/linkedin.ts` | `serializeForLinkedIn`, Unicode styling, the fold; unit-tested in `linkedin.test.ts` |
| `web/src/lib/draft.ts` | Draft types, plain text to document, article to post simplification |
| `web/src/lib/useDrafts.ts` | The draft list and the one being edited, with debounced saving |
| `web/src/components/studio/Composer.tsx` | The Post tab |
| `web/src/components/studio/RichEditor.tsx` | The TipTap editor and toolbar |
| `web/src/components/studio/FullPreview.tsx` | The preview dialog |
| `internal/service/drafts.go` | Draft rules (validation, hashtags) |
