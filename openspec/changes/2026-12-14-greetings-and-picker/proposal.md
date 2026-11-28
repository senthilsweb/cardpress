# Greeting texts and a template picker

**Status:** part 1, the picker, is released and deployed. The greetings table, Settings page and `list_greetings` are not built. A greetings writer exists in the agent repository (`2026-12-18-greetings-writer` there).

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
Greetings are kept apart from post and article writing (the owner's decision):
- **Their own schema:** a Zod model for seasonal greetings (occasion, greeting text, short supporting line, keywords) in the agent repository, generating the tool schemas.
- **Their own subagent:** a greetings writer. The coordinator hands greeting requests to it and offers what it returns through `offer_choices` as headline options.
- A read tool, `list_greetings(occasion, query)`, so saved greetings are offered alongside new ones.
- A greetings skill with the occasion's wording rules, and a rubric if grading proves worth its cost.

## Order
1. Picker (web only).
2. Greetings in the database, with Settings and the picker list.
3. Greetings schema, subagent and tool (needs an agent deploy and one paid test).

## Open questions
| Question | Going with, unless the owner says otherwise |
|---|---|
| Headline on the card, or the library title? | Headline; also fill an empty title |
| Greetings shared, or per brand? | Seeded ones shared; added ones belong to a brand |
| Who may add, edit, delete? | Editors and admins; writers use them |
| May the assistant also change the background? | Not yet; the look stays the person's choice |

## Notes
- The picker is a new popup, an exception to the short list in `openspec/project.md`, to be updated when built.
- Takes the next database migration; the embeddings change moves to the one after.
