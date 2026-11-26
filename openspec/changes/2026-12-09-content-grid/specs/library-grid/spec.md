# Library grid

## ADDED Requirements

### Requirement: Compare and sort
#### Scenario: By date
- **WHEN** the person selects the When column
- **THEN** all matching items are ordered by it, across pages

### Requirement: Act from a row
#### Scenario: Edit
- **WHEN** the person chooses Edit on a draft
- **THEN** the editor opens on that item

#### Scenario: Published
- **WHEN** the item is published
- **THEN** View shows it read-only and Edit is not offered

### Requirement: Delete safely
#### Scenario: Several rows
- **WHEN** the person selects rows and deletes them
- **THEN** they are asked to confirm the number, and any item that may not be deleted is kept and named
