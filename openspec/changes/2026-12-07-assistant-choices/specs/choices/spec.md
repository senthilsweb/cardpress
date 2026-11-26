# Choices

## ADDED Requirements

### Requirement: Options are shown as options
#### Scenario: Several titles
- **WHEN** the assistant offers three titles
- **THEN** the chat shows them as one set of radio buttons with the recommended one selected

### Requirement: See it before choosing
#### Scenario: Select a headline
- **WHEN** the person selects another headline
- **THEN** the card on screen shows it at once, and nothing is saved

### Requirement: Versions are the person's decision
#### Scenario: A chat reply
- **WHEN** the assistant changes a draft while replying
- **THEN** the draft changes and no version is made

#### Scenario: Save as version
- **WHEN** the person picks values and presses Save as version
- **THEN** the draft takes them and is saved as one version, without calling a model

### Requirement: Undo one reply
#### Scenario: Undo
- **WHEN** the person presses Undo on the latest change to an item
- **THEN** it is as it was before that reply

#### Scenario: Edited since
- **WHEN** the item was changed after the reply
- **THEN** Undo is refused and nothing changes

### Requirement: Locked items
#### Scenario: Published
- **WHEN** the item is published or scheduled
- **THEN** options cannot be applied or the reply undone, and the reason is shown
