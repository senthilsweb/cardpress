# Design

## The frame (every signed-in page)
```
┌────┬───────────────────┬─────────────────────────────────────────────┐
│ ◆▾ │ SETTINGS          │ API keys                                     │
│    │  Account          │                                              │
│ ✎  │  Brands           │  Keys let an outside tool (the agents, a     │
│ ▤  │  Social accounts  │  script) work as you, in your brands.        │
│ ▦  │ ▸API keys         │                                              │
│ ⚙  │  Users            │  [+ New key]                                 │
│    │  Assistant        │  agents · made 20 Nov · last used 2h  Revoke │
│    │                   │                                              │
│ ◐  │                   │                                              │
│ (S)│                   │                                              │
└────┴───────────────────┴─────────────────────────────────────────────┘
 rail  secondary            page
```
- **Rail (56 px).** From the top:
  - the CardPress mark and name (the owner chose this over a brand square on 2026-11-25);
  - Studio ✎, Library ▤, Calendar ▦, Settings ⚙.
  - At the bottom: the theme toggle and the person (S), in the open brand's colour. Their popup holds the name, the brands (switch, New brand, Manage brands, which opens Settings, Brands), Docs and Sign out.
  - Every icon has a tooltip and a visible label on focus.
- **Secondary (200–320 px, resizable, hidden with Ctrl/⌘ + \ as today).** Its heading names the area and its list shows that area's places. It remembers its width and whether it is hidden.
- **Page.** Full height. A page's own actions sit at the top of the page itself, never in a bar across the window.
- **Narrow screens:** the rail becomes a bottom bar of the same four icons. The secondary list becomes the area's first screen, and choosing an entry goes to its page with a back arrow.

## What each area lists
| Area | Secondary list | Page |
|---|---|---|
| Studio | Chat · Details · Design (today's left column, one row of three) | the canvas |
| Library | All, Posts, Articles; then Drafts, Approved, Scheduled, Published, with counts | the grid or list (`2026-12-09-content-grid`) |
| Calendar | brand filter, a small month, Ready to schedule | the calendar (`2026-12-04-publishing-calendar`) |
| Settings | Account, Brands, Social accounts, API keys, Users (admin), Assistant (admin) | one section a page |

## Where today's places go
| Today | Becomes |
|---|---|
| Account popup → Library | Rail, Library |
| Account popup → Account settings (profile, password tab) | Settings, Account |
| Account settings → API keys tab | Settings, API keys |
| Account popup → Users (drawer) | Settings, Users |
| Account popup → Social accounts (drawer) | Settings, Social accounts |
| Account popup → Manage brands / New brand (drawers) | Settings, Brands; New brand is a form on that page |
| Account popup → theme, Docs, Sign out | rail bottom: theme toggle; the person's popup: Docs, Sign out |
| Brand switcher in the sidebar header | the person's menu at the bottom of the rail |
| Conversations drawer | Chat column: the conversation's name at the top opens the list in place, with search; choosing one returns to it |
| Versions drawer | Details, Record, Versions: the list in place; restoring asks first |
| Edit, Brand | Settings, Brands (the brand's look), and Design for this item |
| Two New buttons | one New above the canvas |
| (none) | Settings, Assistant (admin): whether the agents are connected, their version and the budget a reply, read-only |

Addresses: `/studio/`, `/library/`, `/calendar/`, `/settings/account/`, `/settings/brands/`, `/settings/social/`, `/settings/api-keys/`, `/settings/users/`, `/settings/assistant/`. The old `?open=` queries redirect to them.

## Popups that stay, and only these
| Popup | Why it is a popup |
|---|---|
| The person's menu | who you are, the brands to switch to, Docs, Sign out |
| Confirmations (delete, publish, cancel a post, restore a version) | must stop the person |
| Schedule or move a post | a date, time and zone, then confirm; done in place from the calendar, grid or studio |
| Expanded editor, full preview | as today |

Right-hand panels go. The one exception is the item pane in the Library and Calendar, which shows a selected item beside the list. It is part of the page and narrows it, rather than covering it, so the list stays in view.

## The studio
```
┌────┬─────────────────────────┬────────────────────────────────────────────┐
│ ◆▾ │ [Chat][Details][Design] │ Article ▾ "Short data contracts" ● Draft v2  [+ New] │
│ ✎  ├─────────────────────────┼────────────────────────────────────────────┤
│ ▤  │ ▾ Writing               │ [Post] [Article] [Both]   sizes …           │
│ ▦  │   Title          42/200 │                                            │
│ ⚙  │   Body          [open ⤢]│           the card and text                │
│    │   Summary        98/160 │                                            │
│    │ ▾ Card words            │                                            │
│    │   Headline · Eyebrow …  │                                            │
│    │ ▾ Sharing               │                                            │
│    │   Hashtags · Alt text   │                                            │
│    │ ▾ Planning              │                                            │
│    │   Audience · Topic …    │                                            │
│    │ ▸ Record and versions   │                                            │
│ ◐  ├─────────────────────────┤                                            │
│ (S)│ Draft · 1 missing: Body │                                            │
│    │            [ Approve ]  │                                            │
└────┴─────────────────────────┴────────────────────────────────────────────┘
```
| Today | Becomes |
|---|---|
| Edit, Text | Details, Card words |
| Edit, Write (type, text, hashtags, attachment, review) | Details, Writing and Sharing; status pinned below |
| Publish page's summary and address | Details, Sharing (publishing still confirms) |
| Edit, Design | Design |

- Groups and fields come from the content schema's typed models (`2026-12-06-content-schema`), and the checks shown are the same ones the server makes.
- Fields an agent changed in the last reply are marked until looked at.
- The footer's single action follows the status: Approve, then Publish or Schedule, then Back to draft.
- Delete asks for confirmation, for drafts as for chats.
