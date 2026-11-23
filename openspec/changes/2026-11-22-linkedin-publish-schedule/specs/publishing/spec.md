# Publishing

## ADDED Requirements

### Requirement: LinkedIn post publishing
The system SHALL publish a post draft as an image post with caption and alt text.

#### Scenario: Success
- **WHEN** the user confirms Publish in the full preview
- **THEN** the server uploads the image, creates the post, stores the post URN and URL, and sets status `published`

#### Scenario: Missing credentials
- **WHEN** LinkedIn credentials are not set
- **THEN** publish and schedule are disabled with a link to settings

### Requirement: Reserved characters
The system SHALL escape characters that LinkedIn's Posts API treats as markup in commentary, so the published text matches the preview.

#### Scenario: Text with markup characters
- **WHEN** the text contains characters such as `(`, `)`, `[`, `]`, `{`, `}`, `<`, `>`, `@`, `|`, `~`, `_`, `\` or `*`
- **THEN** they are escaped at the API boundary and the published post reads the same as the preview (verify the exact list against LinkedIn's current documentation when building this)

### Requirement: Confirmation
The system SHALL send nothing until the user confirms a second time in the full preview.

#### Scenario: Publish now
- **WHEN** the user chooses Publish now in the preview
- **THEN** a confirmation naming the author is shown, and only its confirm button creates the job

#### Scenario: Snapshot
- **WHEN** a job is created
- **THEN** the text, hashtags, alt text and the rendered card PNG are stored with it, and later edits to the draft or card do not change it

### Requirement: Scheduling
The system SHALL run scheduled jobs at their scheduled time.

#### Scenario: Claim
- **WHEN** a job is due
- **THEN** it is claimed with an atomic status update so it can run at most once, even with two server instances

#### Scenario: Reschedule and cancel
- **WHEN** a job is still `scheduled`
- **THEN** the user may change its time or cancel it

#### Scenario: Time zone
- **WHEN** a time is chosen
- **THEN** it is stored in UTC with the chosen IANA zone and displayed in that zone

### Requirement: Failure handling
The system SHALL avoid duplicate posts.

#### Scenario: Failed publish
- **WHEN** LinkedIn or the network returns an error
- **THEN** the job becomes `failed` with the error text, nothing is retried automatically, and the user may fix the draft or credentials and publish again, reschedule or cancel

#### Scenario: Crash during publishing
- **WHEN** the server starts and finds a job in `publishing`
- **THEN** it sets `needs_review` and does not retry

#### Scenario: Missed run
- **WHEN** a scheduled job is overdue beyond the grace window, whether the server was down or the scheduler was late
- **THEN** it becomes `missed` and waits for the user to publish now, reschedule or discard

#### Scenario: Unclear answer to the create call
- **WHEN** the create-post request is sent but the connection drops, LinkedIn answers with a server error, or the answer has no post id
- **THEN** the job becomes `needs_review`, and publishing it again requires the user to accept that a duplicate is possible

#### Scenario: Hung publish
- **WHEN** a job has been `publishing` for over ten minutes
- **THEN** it becomes `needs_review`

### Requirement: Human-only publishing
The system SHALL create and release publish jobs only from an explicit human action in the UI.

#### Scenario: No agent path
- **WHEN** content comes from the chat or any agent interface
- **THEN** it can reach a draft at most, and a person must still confirm publish or schedule in the full preview

### Requirement: Articles
The system SHALL NOT publish articles through the API.

#### Scenario: Article draft
- **WHEN** the draft kind is `article`
- **THEN** Publish and Schedule are unavailable and Copy formatted is offered
