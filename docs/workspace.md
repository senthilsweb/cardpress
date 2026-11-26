# Workspace

How the screens are arranged, and what is remembered.

## Navigation

Every page has a narrow dark **navigation bar** on the left:

- **The CardPress mark** at the top opens the brand menu: switch brand, **New brand**, **Manage brands**.
- **Studio** and **Calendar** go to their pages.
- **Library**, **Settings** and **Help** each open a panel beside the bar listing their pages:
  - Library: All, Posts, Articles.
  - Settings: Account, API keys; Brands and Social accounts; for admins, Users and Assistant.
  - Help: Docs, Report a problem, Source code.
- Choosing a page closes the panel, as do **Esc** and a click outside it.
- At the bottom are **hide the work column** (studio only, also **Ctrl/⌘ + \\**) and **you**. Your menu has the light or dark mode, **Docs** and **Sign out**.

Nothing is placed along the top of the window. Each setting is its own page: `/settings/account/`, `/settings/brands/`, `/settings/social/`, `/settings/api-keys/`, `/settings/users/`, `/settings/assistant/`. Old addresses such as `/studio/?open=accounts` go to the matching page.

On a narrow screen the bar runs along the bottom, with the mark (brands) at its left and you at its right. Settings opens on its list.

Popups are kept for quick choices and confirmations: the brand menu, your menu, confirmations, the schedule form, the expanded editor and the full preview. In the studio, the conversation history and an item's versions still open on the right.

## Brands

A brand is an identity (name, handle, logo, fonts, colour sets) with its own card, drafts, publishing queue, assistant conversations and social accounts. The CardPress mark at the top of the navigation opens the list of brands; the open one is ticked.

- **Switch**: click the CardPress mark at the top of the navigation and pick another brand. The whole studio changes to that brand, and the last one you opened is remembered on the server.
- **New brand…** (Settings, Brands): a name, a handle, and either a blank start or a copy of the open brand's logo, colours and fonts. A copy never includes accounts, drafts or posts. A blank brand opens with placeholder card text.
- **Manage brands…** (Settings, Brands): open, reorder, duplicate or archive brands, and restore or delete archived ones. Archiving hides a brand and keeps everything; posts already scheduled still go out. Deleting is only possible from the archive, and is refused while the brand has scheduled or unfinished posts. At least one brand always stays.
- **Accounts** are per brand: Social accounts shows the open brand's, and a post is published with that brand's account only. The publish confirmation names the brand. See [Social accounts](social-settings.md).
- **Queue**: the Publishing queue shows the open brand's posts. Tick **All brands** to see every brand's, each labelled.
- The **Brand** tab edits the open brand. Credentials set through environment variables belong to the first brand only.

## Chat, Edit and the views
The left column has two sides: **Chat** (the [assistant](chat.md), shown first) and **Edit** (Design, Text, Write, Brand). Your choice is remembered.

Above the canvas:

- **Post** shows the card or the feed preview. With Chat open the feed preview starts on, so the text is in view.
- **Article** shows the article as it reads: cover card, title, summary and text, with **Edit** and **Preview and copy**. While you are on Design, Text or Brand it shows the card instead, with the sizes and export buttons.
- **Both** puts them side by side when the canvas is at least 900 pixels wide. Click a side to work on it.
- The **item picker** finds a draft by name, text or hashtag: type a few words, filter to posts or articles, and use the arrow keys and Enter. **New** starts fresh: an empty post or article (the one on screen decides which), a card in the brand's look with nothing written on it, and an empty chat. Deleting the item or the conversation on screen does the same. A dot marks a view that changed while you were looking at another.

On a narrow screen a bar at the bottom switches between **Chat**, **Preview** and **Edit**.

## Versions and published items
- Above the canvas, **v4** is the newest saved version of the item; **· edited** means the text changed since. Click it to see all versions.
- Every change the assistant saves is a version, and what you had just before is kept too. Your own typing becomes a version at most every ten minutes, and when you approve, send or save one by hand.
- **Make current** brings an earlier version back by saving it as a new one.
- A **published** item (a sent post, or a live page) is locked. Choose **Back to draft** to change it; a live page goes offline until you approve and publish it again.

## Sidebar
- **Make the left column wider or narrower** by dragging the grip on its right edge (320 to 720 pixels; double-click to reset, or focus it and use the arrow keys). The width is remembered.

- **Hide or show** the whole sidebar with the button near the bottom of the navigation bar, or **Ctrl/⌘ + \\**. The canvas grows to use the space, and the editor's expanded view gets the full width. On a narrow screen the sidebar sits above the canvas and hiding it removes it.
- **Fold sections.** Click a section's title (Draft, Hashtags, Colours…) to fold or unfold it. Folded fields cannot be reached with Tab, so they do not get in the way of the keyboard.
- The editor in the Write tab can be **dragged taller or shorter** from its bottom-right corner.

All of this is remembered: it is saved on the server as the `layout` preference, so it is the same in any browser that uses the same server.

## Drawers

The conversation history and an item's versions slide in from the right as a drawer (`components/ui/drawer.tsx`) that does not dim or block the studio; Esc closes it. Settings pages use the same component drawn as a page (`InlineDrawers`), so a panel looks the same in both places.

## Canvas

The work area behind the card is a white sheet with a fine grid (10 px lines, a slightly stronger line every 50 px), in the style of a diagramming tool. The dark theme uses a dark sheet with faint light lines. The grid moves with the content when the canvas scrolls. It is drawn with CSS (`.canvas-grid` in `web/src/styles/global.css`); change `--canvas-bg`, `--canvas-grid-minor` and `--canvas-grid-major` to restyle it.

The expanded post editor has a plain background, without the grid.

## Code map

| File | What it does |
|---|---|
| `web/src/lib/layout.tsx` | The `Layout` type, safe parsing of the saved value, and the context sections read |
| `web/src/components/studio/fields.tsx` | `Section`, the foldable group |
| `web/src/components/studio/Studio.tsx` | Sidebar hide/show and the shortcut |
| `web/src/components/shell/Rail.tsx` | The navigation bar, its panels, and the bar on narrow screens |
| `web/src/components/settings/Settings.tsx` | The settings pages |
| `web/src/lib/nav.ts` | Addresses, the settings list and who sees each entry |

## The article editor

Posts are plain text with LinkedIn's rules: paragraphs, lists, bold and italic. **Articles** are the rich kind. The toolbar offers bold, italic, underline, strikethrough and code; a title, heading and subheading; quote and code block; link; **pictures**, a table and a divider; and undo and redo. Add a picture with the picture button, or paste or drop one: it is shrunk to 1600 px and kept inside the text as base64, so an article with its pictures is a single row in the database (the limit for one article is about 24 MB). In a table, buttons appear to add or remove rows and columns. An article has its own **Title**, used by the library and the file names.

An article is **approved** (marked final) rather than published. Its Full preview shows the **card** above the text, and offers a **planned date**, **For LinkedIn**, and **Markdown** or **HTML** export.

### Editing a long article

Open the **expanded editor** (the arrows in the Article section) for long writing.

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

The clock icon in the **Draft** section opens an item's history in the right drawer: what it said when it was created, approved, sent, restored, saved by hand, and after a stretch of editing (at most one automatic version every ten minutes). Open a version to read it, **Restore** it if it is the one you want, or **Save a version** with a note before a big rewrite. Restoring is an edit like any other: an approved item goes back to draft, and what it said just before is kept as a version too. Pictures in an article are stored once however many versions use them. See [Data model](data-model.md#history).
