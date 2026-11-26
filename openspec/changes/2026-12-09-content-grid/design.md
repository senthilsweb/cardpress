# Design

```
┌ (rail) │ (secondary: All · Posts · Articles · statuses) │ Library ─────────┐
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
- Bulk delete calls the existing single deletes one by one (`DELETE /drafts/{id}`, `DELETE /publish/jobs/{id}`), so each is checked by the same rules and permissions; the page reports which were refused and why. (Built this way in place of a new `POST /library/delete`, so no permission check is repeated.) The confirmation counts the published ones separately: deleting them removes the record, not the LinkedIn post.
- The table is built from the studio's own components; the page uses the full width.
