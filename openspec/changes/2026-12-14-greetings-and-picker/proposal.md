# Greeting texts and a template picker

**Status:** proposed (asked for by the owner on 2026-11-26). Not built; waiting for agreement.

## Why
- A greeting card needs words as well as art, and people reuse the same greetings.
- With seasonal art the background list no longer fits the narrow Design column.

## What changes

### 1. Template picker
The Design column shows the chosen background and a **Browse** button. It opens a large popup: search at the top, categories and occasions on the left, large previews on the right.

```
┌ Templates ─────────────────────────────────────────────── ✕ ┐
│ [ Search "diwali", "thanks"…  ]  │ Thanksgiving             │
│                                  │ ┌──────┐ ┌──────┐ ┌──────┐│
│  All                             │ │ card │ │ card │ │ card ││
│  Abstract                        │ └──────┘ └──────┘ └──────┘│
│  Seasonal greetings              │ Maple weave  Line art  …  │
│    Thanksgiving            ●     │                           │
│    Diwali                        │ Greetings         + Add   │
│    New Year                      │ ○ Happy Thanksgiving      │
│    Chinese New Year              │ ○ With gratitude          │
│                                  │ ☑ Use matching colours    │
│                                  │          [Cancel] [Use]   │
└──────────────────────────────────┴───────────────────────────┘
```

- Previews are the real card, with its text, brand and size.
- Search covers name, description, occasion, category, keywords and greeting texts.
- A click selects; **Use** applies; **Cancel** or Esc changes nothing.
- A greeting is optional and goes into the card's **headline**. Existing words are replaced only when a greeting is selected.
- On a narrow screen the popup fills it and the left list becomes a drop-down.

### 2. Greeting texts
- Greetings are rows in the database: text, occasion, keywords. A starter set is seeded.
- Add, edit and delete in **Settings → Greetings**; **+ Add** in the picker adds one on the spot.
- The server holds the list in memory and drops it on every add, edit or delete, so the next read is fresh. This assumes one server machine.

### 3. In chat
- A read tool, `list_greetings(occasion, query)`. The assistant offers saved greetings and new ones of its own through `offer_choices`, as headline options.
- No new subagent: a greeting is a few words, and a subagent adds cost and waiting. Revisit if greetings need rules of their own.

## Proposed order
1. Picker (web only).
2. Greetings in the database, with Settings and the picker list.
3. Chat tool (needs an agent deploy and one paid test).

## Open questions
| Question | Suggested |
|---|---|
| Headline on the card, or the library title? | Headline; also fill an empty title |
| Greetings shared, or per brand? | Seeded ones shared; added ones belong to a brand |
| Who may add, edit, delete? | Editors and admins; writers use them |
| May the assistant also change the background? | Not yet; the look stays the person's choice |

## Notes
- The picker is a new popup, an exception to the short list in `openspec/project.md`, to be updated when built.
- Takes the next database migration; the embeddings change moves to the one after.
