# Card

## ADDED Requirements

### Requirement: Footer
The system SHALL draw the footer as small text at the bottom edge, with a left text and a right-aligned text at the bottom right, and no line above it.

#### Scenario: Both texts
- **WHEN** the footer is shown and both texts are set
- **THEN** the left text is muted at the bottom left and the right text is accent-coloured at the bottom right, close to the bottom edge

#### Scenario: Defaults
- **WHEN** a footer text is empty
- **THEN** the left falls back to the profile website and the right to the profile handle

#### Scenario: One text only
- **WHEN** only the right text exists
- **THEN** it stays at the bottom right

### Requirement: Sample card
The system SHALL start a new design from the sample text, and SHALL replace only untouched placeholder text in a saved design.

#### Scenario: Untouched card
- **WHEN** a saved design still has the old eyebrow, title and subtitle
- **THEN** the sample text is used and its layout, colours and background are kept

#### Scenario: Edited card
- **WHEN** any of those three has been changed
- **THEN** the design is not modified
