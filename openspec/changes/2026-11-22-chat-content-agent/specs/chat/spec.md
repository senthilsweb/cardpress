# Chat

## ADDED Requirements

### Requirement: Conversation start
The system SHALL start a conversation from a URL or pasted text.

#### Scenario: URL source
- **WHEN** the user submits a URL
- **THEN** the server fetches it under the safety rules and gives the extracted text to the agent as untrusted content

#### Scenario: Unsafe URL
- **WHEN** the URL resolves to a private, loopback or link-local address, or redirects to one
- **THEN** the fetch is refused with a clear message

### Requirement: Content-only proposals
The system SHALL accept only content fields from the agent.

#### Scenario: Valid proposal
- **WHEN** the agent returns kind, title, body, hashtags, alt text and rationale
- **THEN** the panel shows a proposal card

#### Scenario: Design fields
- **WHEN** a proposal contains layout, palette or background fields
- **THEN** they are ignored and not applied

### Requirement: Human approval
The system SHALL require human approval before agent content reaches a draft.

#### Scenario: Approve
- **WHEN** the user approves a proposal
- **THEN** its content is written to the current draft, the proposal is marked approved, and no publish happens

#### Scenario: Iterate
- **WHEN** the user replies with a revision request
- **THEN** a new proposal is produced and earlier ones stay in the history

### Requirement: Persistence
The system SHALL store conversations, messages and proposals in the database.

#### Scenario: Reload
- **WHEN** the page is reloaded
- **THEN** the conversation and its proposal history are restored
