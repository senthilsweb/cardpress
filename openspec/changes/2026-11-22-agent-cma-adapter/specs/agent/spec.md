# Agent adapter

## ADDED Requirements

### Requirement: Managed agent sessions
The system SHALL use one managed-agent session per conversation through the `AgentClient` port.

#### Scenario: Swap
- **WHEN** the adapter is configured
- **THEN** it replaces the mock agent without changes to the chat UI or API
