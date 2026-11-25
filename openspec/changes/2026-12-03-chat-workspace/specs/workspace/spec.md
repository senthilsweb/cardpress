# Workspace

## ADDED Requirements

### Requirement: Two modes in the left column
The system SHALL offer Chat and Edit in the left column, keeping the canvas in view in both.

#### Scenario: Switch
- **WHEN** the person changes mode
- **THEN** the canvas, the item on screen and any unsent message stay as they were

### Requirement: Post and article views
The system SHALL show a conversation's post, its article, or both.

#### Scenario: Article created
- **WHEN** an article is created while the post is on screen
- **THEN** an Article view appears with a dot and the post stays on screen

#### Scenario: Read
- **WHEN** the Article view is open
- **THEN** the cover card, title, summary and body are shown, and Edit opens the editor on that article

#### Scenario: Narrow canvas
- **WHEN** the canvas is under 900 px wide
- **THEN** Both is not offered

### Requirement: Linked drafts
The system SHALL link a conversation to at most one post and one article.

#### Scenario: Reopen
- **WHEN** an earlier conversation is opened
- **THEN** its post and article are the ones shown

#### Scenario: Deleted item
- **WHEN** a linked draft is deleted
- **THEN** the conversation remains and no longer shows that view

### Requirement: Undo a turn
#### Scenario: Undo
- **WHEN** the person chooses Undo on a turn
- **THEN** the fields it changed are restored, except any the person changed afterwards
