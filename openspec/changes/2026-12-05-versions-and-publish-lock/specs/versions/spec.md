# Versions

## ADDED Requirements

### Requirement: Assistant changes are versions
#### Scenario: Follow-up feedback
- **WHEN** an assistant saves a change after the person's feedback
- **THEN** the draft has a new version with the next number, holding that change, and the earlier ones remain

#### Scenario: Unsaved hand edit
- **WHEN** the person edited the text after the newest version and an assistant changes it
- **THEN** the person's text is saved as a version first

### Requirement: Make an earlier version current
- **WHEN** the person makes version 2 current while version 5 is newest
- **THEN** a version 6 with the content of version 2 is saved and is current

### Requirement: Published items are locked
#### Scenario: Change refused
- **WHEN** anyone changes a sent post or an item with a live page (text, card, attachment or restore)
- **THEN** it is refused with how to proceed, and nothing changes

#### Scenario: Back to draft
- **WHEN** the person brings it back to draft
- **THEN** its page goes offline and it can be changed
