# Design

```
┌ CardPress ─────────────────────────────────────────────── TemplrPress ▾ ┐
│ [Chat][Details][Design] │ Article ▾ "Short data contracts"  ● Draft  v2   [+ New] │
├─────────────────────────┼───────────────────────────────────────────────┤
│ DETAILS                 │ [Post] [Article] [Both]   sizes …             │
│ ▾ Writing               │                                               │
│   Title          42/200 │                                               │
│   Body          [open ⤢]│                 the card and text             │
│   Summary       98/160  │                                               │
│ ▾ Card words            │                                               │
│   Headline · Eyebrow …  │                                               │
│ ▾ Sharing               │                                               │
│   Hashtags · Alt text   │                                               │
│   Address · Attachment  │                                               │
│ ▾ Record                │                                               │
│   Written by, approved  │                                               │
├─────────────────────────┤                                               │
│ Draft · 1 missing: Address                                              │
│           [ Approve ]   │                                               │
└─────────────────────────┴───────────────────────────────────────────────┘
```

| Today | Becomes |
|---|---|
| Edit, Text | Details, Card words |
| Edit, Write (type, text, hashtags, attachment, review) | Details, Writing and Sharing; status pinned below |
| Publish page's summary and address | Details, Sharing (publishing still confirms in the preview) |
| Edit, Design | Design |
| Edit, Brand | Brand menu, right drawer |
| New in Chat and above the canvas | One New above the canvas |

- Fields an agent changed in the last reply are marked until looked at.
- The footer's single action follows the status: Approve, then Publish or Schedule, then Back to draft.
- Delete asks for confirmation, for drafts as for chats.
- The expanded editor and the full preview stay as they are.
