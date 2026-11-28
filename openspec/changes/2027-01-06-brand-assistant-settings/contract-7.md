# Contract version 7: what changes from 6

The rest of the [version 6 contract](../2026-12-02-conversational-designer/contract.md) stands.

## MCP tool
`get_writing_guide(id, kind?)`, read only. `id` is a draft; `kind` is `greeting` for a post that is a greeting, else
omitted. Answers `{kind, guide, use}`; `guide` is empty when the draft's brand has none. The writers may call it; the
coordinator may not.

## Manifest
| Field | What |
|---|---|
| `version` | 7. CardPress reads 5 to 7 |
| `tiers` | Optional. `[{id, name, agent_id, agent_version, models: [{role, model}]}]`, the default first. Without it there is one tier, from `agent_id` |
| `guides` | Optional. `{post, article, greeting}`, each `{ours, fixed}` in Markdown, shown beside a brand's guide |
| `outcomes.*.rubric` | Criteria that are house style are between `<!-- style -->` and `<!-- /style -->` |
| `confirm_tools` | Gone |

## Outcomes
`max_iterations` is the brand's number of rounds. With checks off no outcome is sent. With a brand's guide, CardPress
removes the marked criteria from the rubric and appends the guide.

## Order
CardPress first, then the agents: the writers call a tool an older CardPress does not have, and it refuses a version 7
manifest.
