# Agent adapter

## ADDED Requirements

### Requirement: Managed agent sessions
The system SHALL use one managed-agent session per conversation through the `agent.Client` port, selected with `CARDPRESS_AGENT=cma`, and keep the demo agent as the default.

#### Scenario: Swap
- **WHEN** the adapter is configured
- **THEN** it replaces the demo agent without changes to the chat UI or API

#### Scenario: Missing settings
- **WHEN** `CARDPRESS_AGENT=cma` is set without an agent id and environment id
- **THEN** the server refuses to start and says how to create them

### Requirement: Structured proposals
The system SHALL receive proposals from the agent as a custom tool call and validate them with the same rules as every other proposal.

#### Scenario: Invalid proposal
- **WHEN** the agent sends a proposal that fails validation
- **THEN** the reason is returned to the agent as a tool error so it can correct it, and after three failures the turn fails

### Requirement: Untrusted source text
The system SHALL send fetched source text once, inside tags marked untrusted, and neutralise tag characters inside it.

#### Scenario: Source tries to close the block
- **WHEN** the source contains a closing source tag followed by instructions
- **THEN** the block still closes exactly once, at the end of the source

### Requirement: Bounded and recoverable turns
The system SHALL stop and interrupt the agent when a reply times out or the person leaves, report a spending limit plainly, and recover from a dropped stream without losing or repeating events.

#### Scenario: Dropped stream
- **WHEN** the event stream ends before the agent finishes
- **THEN** the adapter reconnects, replays the session history without repeating work, and completes the turn
