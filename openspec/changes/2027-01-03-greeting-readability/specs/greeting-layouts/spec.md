# Greeting layouts

## ADDED Requirements

### Requirement: A greeting's words fit
#### Scenario: Long words on a wide card
- **WHEN** the lines are taller than the space between the logo and the footer
- **THEN** the whole block is made smaller, the ornament stays visible and nothing runs into the logo or footer

### Requirement: The art can be seen
#### Scenario: A newly chosen greeting
- **WHEN** the greeting layout, or a background for a greeting card, is chosen
- **THEN** a wash behind the words starts at 70% and can be set from 0 to 100%

#### Scenario: A card made before
- **WHEN** a greeting card without a shade is opened
- **THEN** it keeps its wash until the slider is moved
