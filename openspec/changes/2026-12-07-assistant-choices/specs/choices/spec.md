# Choices

## ADDED Requirements

### Requirement: Options are shown as options
#### Scenario: Several titles
- **WHEN** the assistant offers three titles
- **THEN** the chat shows them as one set of radio buttons with the recommended one selected

### Requirement: Applying is immediate and free
#### Scenario: Use selected
- **WHEN** the person picks values and presses Use selected
- **THEN** the draft takes them as one new version without calling a model

### Requirement: Safe to ignore
#### Scenario: Ignored
- **WHEN** the person does nothing
- **THEN** the draft keeps the recommended values and the options stay until replaced

### Requirement: Locked items
#### Scenario: Published
- **WHEN** the item is published or scheduled
- **THEN** the options cannot be applied and the reason is shown

### Requirement: See it before choosing
#### Scenario: Select a headline
- **WHEN** the person selects another headline
- **THEN** the card on screen shows it at once, and nothing is saved

#### Scenario: Keep as is
- **WHEN** the person chooses Keep as is
- **THEN** the screen returns to the saved values
