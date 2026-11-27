# Dialogs and settings

## ADDED Requirements

### Requirement: Settings open over the work
#### Scenario: Close
- **WHEN** a person opens Settings from the studio and closes it
- **THEN** the studio is as it was

#### Scenario: A settings address
- **WHEN** `/settings/social/` is opened directly
- **THEN** the dialog opens on Social accounts

### Requirement: Nothing is lost silently
#### Scenario: Close with changes
- **WHEN** a page has unsaved changes and the dialog is closed
- **THEN** the person is asked first
