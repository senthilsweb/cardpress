# Composer

## ADDED Requirements

### Requirement: Drafts
The system SHALL store each draft with kind, document, hashtags, alt text, the Unicode-styles option and status. The card design remains the profile's working design.

#### Scenario: Autosave
- **WHEN** the user edits a draft
- **THEN** it is saved through the API after a short debounce and a save failure is shown

### Requirement: LinkedIn text serialization
The system SHALL convert a post document to LinkedIn plain text deterministically.

#### Scenario: Structure
- **WHEN** the document has paragraphs and lists
- **THEN** paragraphs are separated by blank lines and list items become `• ` or `1. ` lines

#### Scenario: Styled characters are opt-in
- **WHEN** the document has bold or italic and the Unicode-styles option is off
- **THEN** the marks are dropped in the output and the editor says so
- **WHEN** the option is on
- **THEN** marked text is mapped to Unicode styled characters and a screen-reader warning is shown

#### Scenario: Limits
- **WHEN** the serialized text exceeds 3,000 characters
- **THEN** publishing and scheduling are disabled and the count is highlighted

### Requirement: Full preview
The system SHALL show a preview of exactly what will be sent before publish or schedule.

#### Scenario: Fold
- **WHEN** the text is longer than about 210 characters
- **THEN** the preview truncates with "…see more" and lets the user expand it

#### Scenario: Gate
- **WHEN** the user chooses Publish or Schedule
- **THEN** a full preview step opens first and the action requires an explicit confirm there

### Requirement: Article copy
The system SHALL let the user copy an article as formatted content.

#### Scenario: Copy formatted
- **WHEN** the user presses "Copy formatted"
- **THEN** the clipboard holds both `text/html` and `text/plain`, falling back to plain text if rich clipboard is unavailable
