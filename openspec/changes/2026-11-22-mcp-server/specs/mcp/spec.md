# MCP

## ADDED Requirements

### Requirement: Shared service layer
The system SHALL serve MCP tools from the same service layer as the HTTP API.

#### Scenario: Same rules
- **WHEN** a tool and an HTTP endpoint perform the same operation
- **THEN** they apply the same validation and produce the same stored result

### Requirement: Content-preparation tools only
The system SHALL expose only content-preparation and read-only tools.

#### Scenario: Tool list
- **WHEN** a client lists tools
- **THEN** no tool can publish, schedule, cancel, or read or write credentials

#### Scenario: Proposed content
- **WHEN** a client calls `propose_content`
- **THEN** a pending proposal is stored and shown to the user for approval, and no draft changes until a person approves it

### Requirement: Access guard
The system SHALL apply the bearer token and exposure guard to the HTTP MCP transport.

#### Scenario: Missing token
- **WHEN** a token is configured and an MCP request has none
- **THEN** the request is rejected with 401

### Requirement: Audit
The system SHALL record every MCP tool call.

#### Scenario: Log entry
- **WHEN** a tool is called
- **THEN** the tool name, a summary of arguments, the caller and the outcome are stored, without secrets

### Requirement: Tools cannot reach anything that publishes or reads credentials
The system SHALL give the MCP tools only read and propose operations.

#### Scenario: By construction
- **WHEN** the tools are built
- **THEN** the interfaces they receive contain no method that publishes, schedules, cancels, edits a draft or reads a credential, and a test lists exactly which methods are reachable

#### Scenario: Unknown arguments
- **WHEN** a tool is called with arguments it does not define (such as `layout` or `publish`)
- **THEN** the call is rejected and nothing is applied

### Requirement: Outside proposals are reviewed
The system SHALL show a proposal from an outside agent to the person before anything is applied.

#### Scenario: Waiting
- **WHEN** an outside agent proposes content
- **THEN** it appears as a pending proposal in a conversation marked as from an outside agent, the Chat tab shows how many are waiting, and no draft changes

#### Scenario: Flooding
- **WHEN** 20 proposals from outside agents are already waiting for a profile
- **THEN** a further one is refused with a message asking for review first

#### Scenario: Outcome
- **WHEN** a person approves, edits or rejects the proposal
- **THEN** the agent can read the status and final content with `get_proposal`

### Requirement: Browser protections
The system SHALL refuse requests a hostile web page could cause.

#### Scenario: DNS rebinding
- **WHEN** no token is configured and a request's Host is not a localhost name or a listed allowed host
- **THEN** it is refused with a message saying how to allow it

#### Scenario: Cross-site change
- **WHEN** a browser makes a state-changing request to the API or MCP from another website
- **THEN** it is refused, unless that site is listed as a trusted origin

### Requirement: Stdio transport
The system SHALL serve MCP over standard input and output through `cardpress mcp`.

#### Scenario: Clean output
- **WHEN** the stdio server runs
- **THEN** standard output carries only protocol messages and logs go to standard error
