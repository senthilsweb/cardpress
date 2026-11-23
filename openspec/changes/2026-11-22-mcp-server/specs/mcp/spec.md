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
