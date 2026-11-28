# Screens

## ADDED Requirements

### Requirement: Usable on a phone
#### Scenario: Article editor
- **WHEN** the expanded editor is open on a screen narrower than 768 px
- **THEN** the text takes the width, without the outline

#### Scenario: Full preview
- **WHEN** the full preview is open on a phone
- **THEN** the card fits the width

### Requirement: Unsaved settings
#### Scenario: Reload
- **WHEN** the page is reloaded while a settings form has unsaved changes
- **THEN** the browser asks first
