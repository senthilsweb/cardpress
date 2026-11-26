# Chat reply

## ADDED Requirements

### Requirement: A short, structured reply
The chat SHALL show each answered turn as a short message with at most four points, and SHALL NOT show the assistant's running text.

#### Scenario: A draft is written
- **WHEN** the assistant saves a post and reports
- **THEN** the chat shows its message and points, the saved version and the check result

#### Scenario: Too long
- **WHEN** a reply field is over its limit
- **THEN** the studio refuses it and says which field

### Requirement: Progress while working
While a turn runs the chat SHALL show the current step.

### Requirement: Never silent
#### Scenario: No report
- **WHEN** a turn ends without a report
- **THEN** the chat shows the assistant's last words, cut at 400 characters
