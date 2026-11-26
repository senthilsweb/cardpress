# Chat history

## ADDED Requirements

### Requirement: Everything comes back
#### Scenario: Reopen
- **WHEN** the person opens an earlier conversation
- **THEN** every message, source, step, saved version, check result and choice is shown in order

### Requirement: Failures are kept
#### Scenario: A reply fails
- **WHEN** a reply ends in an error
- **THEN** reopening the conversation shows the message, the error and anything that had been saved
