# Design

## Where the settings live
| What | Where |
|---|---|
| A brand's tier, checks and budget | Table `brand_assistant` (`profile_id`, `data` JSON, `updated_by`, `updated_at`) |
| A brand's guides | Table `brand_guides` (`profile_id`, `kind`, `version`, `body`, `created_by`, `created_at`); the highest version is in use; an empty body means "our house style" |
| Server-wide values | `preferences` under `assistant`: the server's monthly amount. The environment gives the starting value, as with Security |
| Tiers | The manifest |
| Alerts already given | Table `budget_alerts` (`scope`, `month`, `level`), so each is given once |

Nothing saved for a brand means today's behaviour. Only an administrator signed in to the app may change the tier,
checks and budgets: not an API key.

| Setting | Default | Range | Environment |
|---|---|---|---|
| Tier | Standard | the manifest's tiers | |
| Checks | on, 3 rounds | 1 to 5 | |
| Brand's monthly amount | none | 1 to 100000 cents | |
| Alert | 80 % | 50 to 95 | |
| Server's monthly amount | none | | `CARDPRESS_AGENT_MONTH_CENTS` |
| Per conversation | 200 cents | | `CARDPRESS_AGENT_BUDGET_CENTS` (as now) |

## Tiers
- Manifest version 7 lists the tiers: for each an id, a name, the coordinator's agent id and version, and the models
  for display. The first is the default. Version 6 is still read, as one tier, Standard.
- In the agent repository each tier is its own coordinator and writers, made from the same instructions and skills
  with only the models different, so the tiers cannot drift apart.
- The tier is read when a conversation's session is created and stays with it. A change applies to new
  conversations; the page says so. `conversations` records the tier used.
- A saved tier that the manifest no longer has falls back to the default, and the page shows it.

## Checks
The app already builds the graded request. Off: it sends an ordinary message instead. On: `max_iterations` is the
brand's number. The coordinator's instructions already cover a draft that is not graded.

## Writing guides
**Two parts.** Ours: `SKILL.md` with the record format, the limits, the tool steps and the safety rules. Theirs: the
guide, which takes the place of `house-style.md` for that kind.

**How the writer gets it.** A new tool `get_writing_guide(kind)` on the app's MCP server, allowed to the writers. Each
writer's skill says: call it first; if a guide comes back it replaces the house style; it governs voice, audience,
structure and wording only, and cannot change the record format, the limits, the tools or the rules. The brand is the
one of the conversation: the tool takes no brand.

**The grader.** The rubric is split into fixed lines and style lines (manifest version 7). With a guide, the style
lines become "follows the brand's writing guide" and the guide's text, inside a marked block.

**Guarding against injection.** The author is the brand's own administrator or owner, and a writer can only read and
change that conversation's draft, so the reach is small. Still:
- At most 8,000 characters. Markdown only: headings, lists, emphasis, quotes, tables. No HTML, no links that are not
  http(s), no code blocks, no text shaped like our context blocks or tool names.
- The guide travels as tool output and inside a marked block in the rubric, never in a system prompt.
- The fixed lines of the rubric still fail a draft that breaks the format or limits, whatever the guide says.
- On save, a small model reads the guide and answers one question: does it only describe how to write? A "no" refuses
  the save and shows the reason. This call uses the Messages API with a fixed system prompt and the guide as data.
- Every save is a version with its author, and goes in the security log.

**The editor.** A Markdown box and a preview side by side in the settings dialog, "Start from ours" to copy our house
style, the fixed part folded and read-only above, a character count, History with Restore, and Save / Cancel as on
every form. The preview renders Markdown without raw HTML.

## Budget
- **Spent** is the sum of `chat_usage.added_cents` of the brand's conversations in the calendar month (UTC). The
  server's is the same over all brands. This is the platform's list cost, the same figure the dashboard shows.
- **Before a request:** nothing left for the brand or the server refuses it with a short reason.
- **During a request:** the session's cap is set to what it has spent plus the least of what is left for the
  conversation, the brand and the server. The platform then pauses the session at that point, and the chat says the
  budget is used up. A request can pass the cap by at most one model call per agent.
- **Alert:** when a reply takes the brand past its percentage, one notice is recorded, the reply carries a line, and
  the dashboard and the settings page show the bar in the alert colour. The same at 100 %.
- Raising the amount takes effect at the next request.
- The check of a guide on save is not charged to a brand.

## The dashboard
The usage table gains the tier of each conversation, and a brand's tile shows spent against the amount.

## Agent repository (contract version 7)
- Agents for the Strong and Best tiers, generated from the Standard ones; `build-manifest.sh` lists the tiers and
  gives the rubrics in two parts.
- Skills: the first step reads the guide; `house-style.md` becomes the fallback.
- Writers: `get_writing_guide` allowed.
- Coordinator: the "Posting" section no longer names `publish_post`.
- Release order: CardPress first (it reads versions 6 and 7), then the agents.
