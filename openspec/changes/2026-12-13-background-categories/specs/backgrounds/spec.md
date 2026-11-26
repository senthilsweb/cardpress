# Backgrounds

## ADDED Requirements

### Requirement: Backgrounds are listed by category
#### Scenario: Open the Design panel
- **WHEN** the card uses a seasonal background
- **THEN** the panel shows Seasonal greetings, with a heading for each occasion

#### Scenario: No category named
- **WHEN** a background names no category
- **THEN** it is listed under Abstract

### Requirement: New backgrounds are added at design time
#### Scenario: A file in a folder
- **WHEN** a file under `card/bg/` exports one or more backgrounds and the app is built
- **THEN** each appears under its category without editing a registry

### Requirement: Seasonal art is vector and repeatable
#### Scenario: Export
- **WHEN** a card with a seasonal background is exported as an image
- **THEN** the art matches what is on screen

#### Scenario: Text stays as written
- **WHEN** the person selects a seasonal background
- **THEN** the card's text does not change
