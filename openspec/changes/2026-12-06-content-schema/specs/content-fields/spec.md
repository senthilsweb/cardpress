# Content fields

## ADDED Requirements

### Requirement: One description of the fields
The agent project SHALL describe every content and governing field once, and skills, rubrics and the studio SHALL take limits from it.

#### Scenario: A standard changes
- **WHEN** the owner changes a length standard in the schema and redeploys
- **THEN** the writer, the grader and the studio's counter all use the new value

### Requirement: The server stays the limit
#### Scenario: A looser schema
- **WHEN** the manifest allows more than the server accepts, or names an unknown field
- **THEN** the server refuses the manifest and says which field

### Requirement: Distinct names
The card headline SHALL be `headline` and the item's title `title` in agent files, tools and screens.

### Requirement: See what is missing
#### Scenario: Not ready
- **WHEN** a field needed for approving or publishing is empty or over its limit
- **THEN** the studio names that field next to the action, before the action is tried
