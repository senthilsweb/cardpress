# User guide

## ADDED Requirements

### Requirement: The guide is part of the app
#### Scenario: Open it
- **WHEN** a signed-in person presses User guide
- **THEN** the guide opens in the app, starting at Getting started

### Requirement: Honest about networks
#### Scenario: A network without publishing
- **WHEN** a person reads how to connect X or Instagram
- **THEN** the page says that CardPress does not yet publish there

### Requirement: No technical content
#### Scenario: A user page
- **WHEN** any page of the guide is read
- **THEN** it needs no knowledge of the server, the code or the API
