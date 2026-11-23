# Social settings

## ADDED Requirements

### Requirement: Encrypted credential storage
The system SHALL encrypt every credential field before it is written to the database.

#### Scenario: Key required
- **WHEN** `SCS_SECRET_KEY` is unset in a non-local mode
- **THEN** saving a credential is rejected with an explanatory error
- **WHEN** it is unset in local mode
- **THEN** a key file is generated beside the database with mode 0600

### Requirement: Masked reads
The system SHALL never return a stored secret in full.

#### Scenario: Display
- **WHEN** the settings are loaded
- **THEN** each stored secret appears as `••••` plus its last four characters, with a flag for "set via environment" where it applies

### Requirement: Environment override
The system SHALL prefer environment values over stored ones.

#### Scenario: Locked field
- **WHEN** an environment value exists for a field
- **THEN** the field is read-only in the UI and the environment value is used for API calls

### Requirement: Test connection
The system SHALL verify LinkedIn credentials on request.

#### Scenario: Result
- **WHEN** the user presses Test connection
- **THEN** the server calls an authenticated LinkedIn endpoint and reports valid, invalid or expired, with the expiry date if the API gives one

### Requirement: Drawer presentation
The system SHALL present the settings as a right-hand drawer rather than a modal dialog.

#### Scenario: Non-modal
- **WHEN** the drawer is open
- **THEN** the rest of the studio stays visible and usable, and nothing is dimmed

#### Scenario: Frozen actions
- **WHEN** the body is scrolled
- **THEN** the footer with Save and Test connection stays fixed at the bottom, acting on the selected network tab

#### Scenario: Unsaved changes
- **WHEN** the user closes the drawer with unsaved changes
- **THEN** it asks whether to discard them before closing
