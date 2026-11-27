# Ornaments

## ADDED Requirements

### Requirement: Ornaments are added at design time
#### Scenario: A new file
- **WHEN** a file under `card/ornament/` exports an ornament and the app is built
- **THEN** it can be picked without editing a registry

### Requirement: Existing cards do not change
#### Scenario: A card saved before
- **WHEN** a greeting card with no ornament setting is opened
- **THEN** it shows the heart flourish, or none if it had been switched off
