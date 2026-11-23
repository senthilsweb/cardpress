# Workspace

## ADDED Requirements

### Requirement: Hide and show the sidebar
The system SHALL let the user hide and show the sidebar and remember the choice.

#### Scenario: Toggle
- **WHEN** the user presses the header button or Ctrl/⌘ + `\`
- **THEN** the sidebar slides closed or open and the canvas fills the remaining width

#### Scenario: Remembered
- **WHEN** the page is reloaded
- **THEN** the sidebar is in the state the user left it, read from the server

#### Scenario: Hidden content is unreachable
- **WHEN** the sidebar is hidden
- **THEN** its controls cannot be focused with the keyboard

### Requirement: Foldable sections
The system SHALL let each sidebar section be folded from its title.

#### Scenario: Fold
- **WHEN** the user clicks a section title
- **THEN** its content collapses, the title shows a collapsed marker with `aria-expanded="false"`, and its fields leave the tab order

#### Scenario: Header actions
- **WHEN** a section has actions beside its title
- **THEN** using an action does not fold the section

### Requirement: Resizable editor
The system SHALL let the user change the height of the sidebar post editor and remember it.

#### Scenario: Drag
- **WHEN** the user drags the editor's corner
- **THEN** the editor takes that height, with a minimum, and the height is saved

### Requirement: Grid canvas
The system SHALL draw the canvas as a fine grid on a plain sheet, in light and dark themes.

#### Scenario: Expanded editor
- **WHEN** the post editor is expanded over the canvas
- **THEN** it has a plain background without the grid
