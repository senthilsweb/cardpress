# Claude Managed Agent

By default the chat uses a built-in demo agent (no AI). You can switch it to a [Claude Managed Agent](https://docs.anthropic.com) so a real model writes the posts. Everything else is unchanged: it only prepares content, you approve, edit or reject each proposal, and nothing is published without you.

> When this is on, the conversation (and any web page or text you give the chat) is sent to Anthropic. The chat shows that it is an AI agent.

## Set up (once)

1. Create an API key in the Anthropic console and export it: `export ANTHROPIC_API_KEY=...`
2. Run `cardpress agent-setup` (optionally `-model claude-opus-5-5`). It creates one agent and one environment in that account and prints the ids. It is the only thing that creates anything there, and it runs only when you run it.
3. Start the server with:

```
CARDPRESS_AGENT=cma
CARDPRESS_AGENT_ID=agent_...
CARDPRESS_AGENT_ENVIRONMENT_ID=env_...
ANTHROPIC_API_KEY=...
```

Optional: `CARDPRESS_AGENT_VERSION` (pin an agent version; default latest), `CARDPRESS_AGENT_BUDGET_CENTS` (spend cap per conversation, e.g. `500` = $5), `CARDPRESS_AGENT_TIMEOUT` (longest wait for one reply, default `4m`).

## What the agent can and cannot do

- It has one tool, `propose_content`, whose input is the proposal: kind, title, body, hashtags, alt text and a short rationale. No layout, colours, scheduling or publishing.
- It has none of the built-in tools (no shell, files or web), and its environment has no network. CardPress fetches web pages itself, with its own safeguards, and passes the text in once.
- Source text is wrapped in `<source untrusted="true">` tags and the agent is told to treat it as data. This lowers the chance that a hostile page steers it; the real protection is that the agent has nothing dangerous to do: the worst outcome is a bad draft that you reject.
- An invalid proposal is returned to the agent with the reason so it can fix it (three tries).

## Behaviour

- One session per conversation; only your newest message is sent each turn because the session remembers the thread.
- The reply streams in as it is written. If the connection drops, the adapter reconnects and catches up from the session history.
- If a reply takes longer than the timeout, or you leave, the session is interrupted so it stops spending. If the spend cap is reached, the chat says so and you start a new conversation.
- Conversations created with the demo agent cannot continue under the managed agent (and the other way round); start a new one.
- Changing the agent's instructions means creating a new agent version; existing conversations keep the version they started with unless you pin one.

## Troubleshooting

- "could not start a session": check `ANTHROPIC_API_KEY`, the ids, and that the account has Managed Agents access.
- "the agent kept failing and gave up": an upstream error; try again.
