# Workspace

How the screens are arranged, and what is remembered.

## The frame

Every signed-in page has a **header** and a **side bar**, and shows the page on its own surface (`components/shell/Rail.tsx`).

- **Header:** the logo, the **brand menu** (switch brand, **New brand**, **Manage brands**), the open page's controls (in the studio: Post or Article, the version, the item picker and **New**), light or dark, the user guide and the person's menu (**Appearance**, **User guide**, **About CardPress** with the version, build, database and the assistant's versions, **Sign out**).
- **Side bar:** Studio, Calendar and Guide go to their pages; **Library** and **Settings** open a panel listing theirs (Library: All, Posts, Articles. Settings: Account, Appearance, API keys; Brands, Brand look, Social accounts; for admins Users, Assistant). Esc or a press outside closes it. At the bottom: hide the studio's work column (**Ctrl/⌘ + \\**), and show icons only (remembered in the browser).
- On a narrow screen the header is shorter and the side bar runs along the bottom.

## Themes

**Settings → Appearance** chooses **Parchment** (default), **Aubergine**, **Cobalt** or **Graphite**, and Light, Dark or System. It is saved per person (`palette` and `theme` preferences). A theme is a list of named colours in `web/src/styles/themes.css`; a test checks that each can be read. Cards keep their brand's colours.

## Brands

A brand is an identity (name, handle, logo, fonts, colour sets) with its own card, drafts, publishing queue, assistant conversations and social accounts. The brand menu in the header lists the brands; the open one is ticked.

- **Switch**: open the brand menu in the header and pick another brand. The whole studio changes to that brand, and the last one you opened is remembered on the server.
- **New brand…** (Settings, Brands): a name, a handle, and either a blank start or a copy of the open brand's logo, colours and fonts. A copy never includes accounts, drafts or posts. A blank brand opens with placeholder card text.
- **Manage brands…** (Settings, Brands): open, reorder, duplicate or archive brands, and restore or delete archived ones. Archiving hides a brand and keeps everything; posts already scheduled still go out. Deleting is only possible from the archive, and is refused while the brand has scheduled or unfinished posts. At least one brand always stays.
- **Details** (New brand, and Brand look): type (company or individual), name, address, mobile and email, all optional. They are personal data kept in their own table (`brand_details`): only the brand's owner and administrators read them, and they are never on a card or a public page, in a profile export, or sent to the assistant.
- **Accounts** are per brand: Social accounts shows the open brand's, and a post is published with that brand's account only. The publish confirmation names the brand. See [Social accounts](social-settings.md).
- **Queue**: the Publishing queue shows the open brand's posts. Tick **All brands** to see every brand's, each labelled.
- The **pencil** beside a brand's name (Settings, Brands) renames it. Its cards and posts, and the name printed on them (**Logo text**), stay as they are.
- **Edit** (Settings, Brands) changes a brand's name, handle, website, logo, fonts and colour sets, with its card beside them. Credentials set through environment variables belong to the first brand only.

## Chat, Details and Design
The left column has three sides. Your choice is remembered.

- **Chat**: the [assistant](chat.md), shown first.
- **Details**: every field of the item on screen, once.
- **Design**: how its card looks (layout, background, images, colours, fonts).

**Design → Background → Browse backgrounds** opens a picker: search (an occasion such as "thanks" or "diwali" works), categories on the left, and your own card drawn with each background. A seasonal one offers matching colours. Nothing changes until you press **Use**.

A footer field that has never been written shows the brand's handle (right) or website (left). Once you clear it, or the assistant does, it stays empty; **Use the brand's** under the field brings it back.

### Details

| Group | Fields |
|---|---|
| Writing | type, title, body, and an article's summary |
| Card words | eyebrow, headline, subtitle, tag, footers, quote author, number. Those the layout does not draw are listed last |
| Sharing | hashtags, attachment, alt text, Unicode styles, and an article's page address |
| Planning | audience, topic, campaign, review notes. None is published |
| Publishing queue | posts waiting and sent (folded) |
| Record and versions | who created and approved it, its versions, and delete (folded) |

- A counter shows each limit. Where there is a writing standard it shows the aim too ("620 · aim 600–1,300"), in amber when outside it. The standard never blocks anything.
- A field the assistant changed is marked **Changed** until you look at it.
- The bottom of the column always shows the status, what is missing, and the next step: **Approve**, then **Publish**, then **Back to draft**.
- Planning fields, the summary and the address are saved when you leave the field. Changing the summary or address returns an approved item to draft; changing a planning field does not. Review notes are written by an editor or admin.
- While you type in Card words, the canvas shows the card.

Above the canvas:

- **Post** shows the card or the feed preview. With Chat open the feed preview starts on, so the text is in view. A feed preview opens and closes its text (**see more**, **see less**).
- **Full preview** on the canvas toolbar (**Ctrl/⌘ + Enter** away from a text field) opens the item as it is now, from any column. The window belongs to Details, which is there out of sight while it is open.
- **Article** shows the article as it reads: cover card, title, summary and text, with **Edit** and **Preview and copy**. While you are on Design, or typing in Card words, it shows the card instead, with the sizes and export buttons.
- **Both** puts them side by side when the canvas is at least 900 pixels wide. Click a side to work on it.
- The **item picker** finds a draft by name, text or hashtag: type a few words, filter to posts or articles, and use the arrow keys and Enter. **New** starts fresh: an empty post or article (the one on screen decides which), a card in the brand's look with nothing written on it, and an empty chat. It is the only **New**, and stays above the screen on a phone. Deleting the item or the conversation on screen does the same. A dot marks a view that changed while you were looking at another.

On a narrow screen a bar at the bottom switches between **Chat**, **Preview**, **Details** and **Design**.

## Versions and published items
- Above the canvas, **v4** is the newest saved version of the item; **· edited** means the text changed since. Click it to see all versions in Details.
- A change by the built-in assistant becomes a version when you press **Save as version** under its reply; what you had typed is kept first. Each change by an outside agent is a version. Your own typing becomes a version at most every ten minutes, and when you approve, send or save one by hand.
- **Make current** brings an earlier version back by saving it as a new one.
- A **published** item (a sent post, or a live page) is locked. Choose **Back to draft** to change it; a live page goes offline until you approve and publish it again.

## Sidebar
- **Make the left column wider or narrower** by dragging the grip on its right edge (320 to 720 pixels; double-click to reset, or focus it and use the arrow keys). The width is remembered.

- **Hide or show** the whole sidebar with the button near the bottom of the side bar, or **Ctrl/⌘ + \\**. The canvas grows to use the space, and the editor's expanded view gets the full width. On a narrow screen the sidebar sits above the canvas and hiding it removes it.
- **Fold sections.** Click a section's title (Writing, Sharing, Colours…) to fold or unfold it. Folded fields cannot be reached with Tab, so they do not get in the way of the keyboard.
- The editor in Details can be **dragged taller or shorter** from its bottom-right corner.

All of this is remembered: it is saved on the server as the `layout` preference, so it is the same in any browser that uses the same server.

## Settings

Settings open in a dialog over the page in use (`components/settings/SettingsDialog.tsx`). It takes the page's settings address (`/settings/social/` and the like) while open, so links, bookmarks and the browser's Back button work; closing gives the earlier address back. An address visited directly opens the dialog over an empty frame, and closing goes to the studio.

- The left column groups the pages and searches their names and words; **Ctrl/⌘ + K** goes to the search. On a phone it is a drop-down and the dialog fills the screen.
- A page with something unsaved asks before it is left or closed. **Brand look** saves as you type, and once more on leaving.
- After a change to a brand or its accounts, closing loads the page behind again.

The dialog is `components/ui/panel-dialog.tsx` (the background picker uses it too); a settings page is a `Pane` (`components/ui/pane.tsx`) and says what would be lost with `useUnsaved` (`components/settings/guard.tsx`).

## Canvas

The work area behind the card is a white sheet with a fine grid (10 px lines, a slightly stronger line every 50 px), in the style of a diagramming tool. The dark theme uses a dark sheet with faint light lines. The grid moves with the content when the canvas scrolls. It is drawn with CSS (`.canvas-grid` in `web/src/styles/global.css`); change `--canvas-bg`, `--canvas-grid-minor` and `--canvas-grid-major` to restyle it.

The expanded post editor has a plain background, without the grid.

## Code map

| File | What it does |
|---|---|
| `web/src/lib/layout.tsx` | The `Layout` type, safe parsing of the saved value, and the context sections read |
| `web/src/components/studio/fields.tsx` | `Section`, the foldable group |
| `web/src/components/studio/Studio.tsx` | Sidebar hide/show and the shortcut |
| `web/src/components/shell/Rail.tsx` | The frame: header, side bar, its panels, and the bar on narrow screens |
| `web/src/components/studio/Details.tsx` | The Details column |
| `web/src/lib/details.ts` | Its groups, counters and what is missing, from the content schema (`lib/content/`) |
| `web/src/components/settings/SettingsDialog.tsx` | The settings dialog and which page it shows |
| `web/src/lib/nav.ts` | Addresses, the settings list and who sees each entry |

## The article editor

Posts are plain text with LinkedIn's rules: paragraphs, lists, bold and italic. **Articles** are the rich kind. The toolbar offers bold, italic, underline, strikethrough and code; a title, heading and subheading; quote and code block; link; **pictures**, a table and a divider; and undo and redo. Add a picture with the picture button, or paste or drop one: it is shrunk to 1600 px and kept inside the text as base64, so an article with its pictures is a single row in the database (the limit for one article is about 24 MB). In a table, buttons appear to add or remove rows and columns. An article has its own **Title**, used by the library and the file names.

An article is **approved** (marked final) rather than published. Its Full preview shows the **card** above the text, and offers a **planned date**, **For LinkedIn**, and **Markdown** or **HTML** export.

### Editing a long article

Open the **expanded editor** (the arrows in Writing) for long writing.

- **Fixed toolbar.** The toolbar, the table controls (shown while the cursor is in a table) and the link field stay at the top. Only the text scrolls. The footer stays at the bottom with the word count, the reading time (about 200 words a minute), the character count and the save status.
- **Floating menu.** Select some text and a small menu appears above it: bold, italic, link and heading. Link opens the link field in the toolbar.
- **`/` menu.** Type `/` at the start of an empty paragraph to insert a block: heading, subheading, picture, table, code block, quote, divider, bulleted or numbered list. Keep typing to narrow the list, use the arrow keys and Enter to choose, Esc to close it. The `/` and what you typed after it are removed when the block is inserted.
- **Outline.** The headings (H1 to H3) are listed at the left, indented by level. Click one to jump to it. Hide or show the outline with the button at its top; the choice is remembered in the browser.
- **Width and size.** The toolbar has a button for narrow or wide text and **A-** / **A+** for the text size. Both are remembered in the browser.
- **Saving.** Typing is passed on and saved after a short pause (a quarter of a second, then the usual save delay). Anything that needs the whole text, such as the preview, copying, approving, switching or deleting a draft, or collapsing the editor, takes what you have just typed first. Posts are updated at once.

The code for these is in `components/studio/RichEditor.tsx` (editor, menus, outline), `lib/editorTools.ts` (the `/` list, the outline, the counts) and `lib/pendingEdits.ts` (the pause and the flush).

### For LinkedIn

LinkedIn cannot receive an article from outside, so you paste it into its article editor. **For LinkedIn** prepares it for that: the title (for LinkedIn's own title field) and the body each have a **Copy** button, and the pictures come as a **.zip**. The body keeps headings (two levels), bold, italic, underline, lists, quotes, links and code blocks. What LinkedIn's editor has no place for is changed, and the dialog says what changed: a **table** becomes a list of rows ("Layer: Bronze; Tables: 7"), a **divider** is dropped, strikethrough and inline code lose their styling, and each **picture** becomes a marker such as `[Picture 2: a chart]` to replace with the file. LinkedIn changes its editor from time to time, so check what it accepts if a paste looks different.

## History

**Record and versions** in Details lists what an item said when it was created, approved, sent, restored, saved by hand, and after a stretch of editing (at most one automatic version every ten minutes). Open a version to read it, **Make current** if it is the one you want, or save a version with a note before a big rewrite. Restoring is an edit like any other: an approved item goes back to draft, and what it said just before is kept as a version too. Versions also hold the audience, topic and campaign, not the review notes. Pictures in an article are stored once however many versions use them. See [Data model](data-model.md#history).
