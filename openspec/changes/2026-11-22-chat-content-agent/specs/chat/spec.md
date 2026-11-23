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

#### Scenario: Approve into an empty draft
- **WHEN** the user approves a proposal and the current draft is empty
- **THEN** its content is written to that draft, the proposal is marked approved, and no publish happens

#### Scenario: Approve when the draft has text
- **WHEN** the user approves a proposal and the current draft already has text
- **THEN** the content goes into a new draft and the existing draft is not changed

#### Scenario: Edit first
- **WHEN** the user edits a proposal before approving
- **THEN** the edited content is validated and applied, and the agent's original is kept

#### Scenario: Iterate
- **WHEN** the user replies with a revision request
- **THEN** a new proposal is produced and earlier ones stay in the history

### Requirement: Persistence
The system SHALL store conversations, messages and proposals in the database.

#### Scenario: Reload
- **WHEN** the page is reloaded
- **THEN** the conversation and its proposal history are restored

### Requirement: Source stays separate from instructions
The system SHALL give fetched or pasted text to the agent as source data, apart from the conversation messages.

#### Scenario: Instructions inside an article
- **WHEN** the source text contains instructions addressed to an agent
- **THEN** they are not part of the conversation messages and cannot cause a publish, because the agent can only return a proposal that needs approval

### Requirement: Fetch limits
The system SHALL read web pages only within fixed limits.

#### Scenario: Limits
- **WHEN** a page is fetched
- **THEN** only http and https on ports 80 and 443 are used, redirects are limited to 5 and each is checked, environment proxies are ignored, the request times out after 20 seconds, at most 2 MB is read, only HTML and plain text are accepted, and at most 40,000 characters of text are kept

### Requirement: One reply at a time
The system SHALL write one reply per conversation at a time.

#### Scenario: Second message while replying
- **WHEN** a message is sent while a reply is still being written for that conversation
- **THEN** it is refused with a conflict and nothing is stored
