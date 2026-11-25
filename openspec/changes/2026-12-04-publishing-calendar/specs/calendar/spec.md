# Calendar

## ADDED Requirements

### Requirement: A full page
- **WHEN** the person opens the calendar
- **THEN** it is its own page filling the window, with the calendar as its only content below the header

### Requirement: See what is scheduled
- **WHEN** the person opens the calendar
- **THEN** scheduled, sent and failed posts and planned articles appear on their days, in the person's time zone

### Requirement: Schedule an approved item
#### Scenario: From a day
- **WHEN** the person chooses a day, an approved item and a time, and confirms
- **THEN** a post is scheduled, or an article gets its planned date

#### Scenario: Not approved
- **WHEN** an item is a draft
- **THEN** it cannot be scheduled and the person is told to approve it first

### Requirement: Reach the calendar
- **WHEN** the person opens the account menu, or looks at an article in the Library
- **THEN** a link to the calendar is there, and from an article it opens with that article selected
