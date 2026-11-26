# Design

```
┌ CardPress   Library ────────────────────────────────────────── account ▾ ┐
│ [Search…]  Brand: All ▾  Type ▾  Status ▾        [Grid|List] [Columns ▾] [+ New] │
│ 2 selected                                                      [ Delete 2 ]     │
├──┬─────────┬──────────────────────────┬───────────┬──────────┬──────────┬──┤
│☐ │ Type ↕  │ Title ↕                  │ Status ↕  │ When ↕   │ Brand ↕  │  │
│☑ │ Article │ Short data contracts     │ ● Draft   │ edited 2h│ TemplrPress │ ⋯│
│☐ │ Post    │ Eleven broken dashboards │ ◷ 26 Nov 10:00        │ …        │ ⋯│
│☐ │ Post    │ Our first release        │ 🔒 Published 24 Nov   │ …        │ ⋯│
└──┴─────────┴──────────────────────────┴───────────┴──────────┴──────────┴──┘
 1–20 of 134          ‹ 1 2 3 … 7 ›                          20 per page ▾
```

| Column | Shown at first |
|---|---|
| Thumbnail, type, title, status, when, brand (when "All") | yes |
| Written by, approved by, version, planned date, public page, LinkedIn link | from **Columns** |
| Audience, topic, campaign | from **Columns**, once the content schema adds them |

## Rows and actions
| Row | View | Edit | Schedule | Back to draft | Delete |
|---|---|---|---|---|---|
| Draft | yes | yes | | | yes |
| Approved | yes | yes (returns to draft on change) | yes | yes | yes |
| Scheduled | yes | | move | cancel first | |
| Published | yes, read-only | | | yes | the record only, as today |

## Server
- `GET /api/v1/library` gains `sort` and `order`, and the extra columns. Sorting and paging stay on the server.
- `POST /api/v1/library/delete` `{items}`: each checked like a single delete; the answer says which were refused and why.
- The table is built from the studio's own components; the page uses the full width.
