# Claude Managed Agent

The chat is answered by Claude Managed Agents: a coordinator with a post writer and an article writer. Without them the **Chat** panel says no assistant is set up, and writing, design and publishing work as usual.

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

Optional: `CARDPRESS_AGENT_BUDGET_CENTS` (spend cap per conversation, default `200` = $2, `0` = none) and `CARDPRESS_AGENT_TIMEOUT` (longest wait for one reply, default `12m`).

The server refuses to start if the manifest's version is not the one it speaks, or if the manifest's MCP address is not `CARDPRESS_PUBLIC_URL` + `/mcp`, because the agents would then be writing to a different server.

On Fly, a file path on your machine does not exist there: give the manifest as an https address, or store the JSON itself with `fly secrets set CARDPRESS_AGENT_MANIFEST="$(cat manifest.json)"`.

## Who can use it

With accounts on, **only the admin** can send messages, and only in **brands the admin owns**. The vault holds one key, which acts as that one account, so store a key of the admin who will chat. Per-person keys are not built yet.

## What happens in a conversation

- Tick **Post**, **Article** or both. CardPress creates the draft if the conversation has none and tells the agent which one to write.
- The **first** draft of each kind is graded against its rubric and revised up to three times. The verdict is shown on a card under the reply. Later messages are ordinary requests.
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
