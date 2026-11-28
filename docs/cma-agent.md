# Claude Managed Agent

The chat is answered by Claude Managed Agents: a coordinator with a post writer, an article writer and a greetings writer. Without them the **Chat** panel says no assistant is set up, and writing, design and publishing work as usual.

The agents are defined and deployed from a separate repository (agent files, writing skills and grading rubrics). CardPress only starts sessions with them.

> When this is on, your messages, attached sources and the drafts the agent reads are sent to Anthropic.

## What you need

| Thing | Where it comes from |
|---|---|
| Deployed agents, an environment and a vault | The agent repository's deploy steps |
| The **manifest** (`manifest.json`: ids, rubrics, the MCP address; no secret) | The agent repository's `scripts/build-manifest.sh` |
| A CardPress API key stored in the vault | Create it in CardPress, then store it with the agent repository's vault script |
| An Anthropic API key | The Anthropic console |
| A CardPress address the agents can reach over https | Your deployment |

## Settings

```
CARDPRESS_AGENT=cma
CARDPRESS_AGENT_MANIFEST=/path/to/manifest.json   # or an https address, or the JSON itself
CARDPRESS_PUBLIC_URL=https://cards.example.com    # must match the manifest's MCP address
ANTHROPIC_API_KEY=...
ANTHROPIC_WORKSPACE_ID=...                        # only for a key that covers several workspaces
```

Optional: `CARDPRESS_AGENT_BUDGET_CENTS` (spend cap per conversation, default `200` = $2, `0` = none), `CARDPRESS_AGENT_MONTH_CENTS` (spend cap for every brand together in a calendar month, default none) and `CARDPRESS_AGENT_TIMEOUT` (longest wait for one reply, default `12m`).

The server speaks manifest version 7 (tiers, and the house styles shown beside a brand's writing guide) and still accepts versions 5 and 6, so the server can be deployed before the agents. It refuses to start if the manifest's version is neither, if the manifest allows more than the server accepts, or if the manifest's MCP address is not `CARDPRESS_PUBLIC_URL` + `/mcp`, because the agents would then be writing to a different server.

Releasing an update, and going back, is in [Release, back up and restore](release.md).

On Fly, a file path on your machine does not exist there: give the manifest as an https address, or store the JSON itself with `fly secrets set CARDPRESS_AGENT_MANIFEST="$(cat manifest.json)"`.

## Settings for each brand

Under **Settings → Brand assistant** an administrator sets, for the open brand:

| Setting | What it does | Default |
|---|---|---|
| Tier | The set of agents new conversations use: the same work on other models. The tiers are the manifest's | the first (Standard) |
| Check first drafts, rounds | Whether a first draft is graded, and how often it may be sent back (1 to 5) | on, 3 |
| Monthly budget, alert | What the brand may cost in a calendar month (UTC), and when to warn | none, 80% |

**Settings → Assistant** has a monthly budget for the whole server (all brands share one API key).

**How a budget is kept.** The cost is the list price Managed Agents reports, added to a monthly ledger with each reply, including one that failed or was stopped. With nothing left, a request is refused (HTTP 402). Otherwise the session's spending limit is set to what is left before each request, so the service stops the agent there; the request that crosses the limit still completes, so a month can end slightly over. The alert and the used-up notice are given once a month, in the chat and in the security log.

## Writing guides

Under **Settings → Writing guides** the brand's owner or an administrator writes, in Markdown, how posts, articles and greetings are to be written. A guide takes the place of the agents' house style for that kind. The record format, limits, tools and safety rules stay.

- Rules on saving: at most 8,000 characters; no HTML or tags, code blocks, pictures, hidden characters, links other than web addresses, or names of the studio's tools.
- With the agent set up, a small model (Claude Haiku) also reads a new guide and refuses anything but how to write. If it cannot be reached, the guide is not saved. The check costs a fraction of a cent and is not counted against a budget.
- A writer reads the guide with the `get_writing_guide` [tool](mcp.md), for the brand of the draft. The grader is given it in place of our style criteria.
- Every save is a version (the newest 50), with Restore, and is listed in the security log.

## Who can use it

With accounts on, **only the admin** can send messages, and only in **brands the admin owns**. The vault holds one key, which acts as that one account, so store a key of the admin who will chat. Per-person keys are not built yet.

## What happens in a conversation

- Tick **Post**, **Article** or both. CardPress creates the draft if the conversation has none and tells the agent which one to write.
- The **first** draft of each kind is graded against its rubric and revised up to three times, or as the brand's settings say; checks can be off. The verdict is shown on a card under the reply. Later messages are ordinary requests.
- The agent answers through the `report_reply` tool; the studio shows that answer and nothing else it writes.
- A question with a few fixed answers shows them as buttons. A press sends that text as your message; typing works as before.
- The agents save through [MCP](mcp.md). Every save is a new version, so you can go back. Published and scheduled items are locked.
- The agents can change the words on the card, never its look. They cannot publish.
- If you edit a draft or card yourself, the next message tells the agent what changed.
- Progress shows while it works. A graded article can take several minutes.
- **Stop** interrupts the session so it stops spending. The spend cap does the same.
- The cost at list price is shown per conversation in the history drawer.
- If the session is gone, a new one starts from your saved messages and sources.

## Troubleshooting

| Message | Check |
|---|---|
| could not start a session | The API key, workspace id and manifest ids |
| the agent finished without saying anything / cannot reach a tool | The vault key is valid and the environment allows the MCP host |
| reached its spending limit | Start a new conversation, or raise the cap |
| asked to do something that needs your confirmation | A tool in the agent files is set to ask first; the app cannot confirm yet |
