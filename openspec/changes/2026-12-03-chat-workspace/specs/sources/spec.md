# Sources

## ADDED Requirements

### Requirement: Several kinds of source
The system SHALL accept a web address, pasted text, and PDF, DOCX, Markdown and text files, up to ten per conversation, at any point.

#### Scenario: Long paste
- **WHEN** more than 1,500 characters are pasted into the message box
- **THEN** they become a text source, not part of the message

#### Scenario: Wrong file
- **WHEN** a file is too large, of another type, or not what its name says
- **THEN** it is refused with the reason and nothing is stored

#### Scenario: Cut short
- **WHEN** a source's text is longer than the limit
- **THEN** it is kept up to the limit and marked as cut

### Requirement: Topic only
- **WHEN** a person asks for a post without adding a source
- **THEN** the conversation starts from their message

### Requirement: Sources are data
#### Scenario: Instructions inside
- **WHEN** a source contains instructions or imitates the app's message blocks
- **THEN** it reaches the agent escaped and marked untrusted
