# MCP

## REMOVED Requirements

### Requirement: Content-preparation tools only
Replaced by "Tools that act are scoped and listed".

### Requirement: Tools cannot reach anything that publishes or reads credentials
Replaced by "Tools that act are scoped and listed".

## ADDED Requirements

### Requirement: Tools that act are scoped and listed
The system SHALL expose tools that change the words on a card, write a draft, keep notes and publish a post, and SHALL give them only the methods those tools need.

#### Scenario: Reachable methods
- **WHEN** the tools are built
- **THEN** a test lists exactly which service methods are reachable, and none schedules, reschedules, cancels or deletes a job, deletes a draft, or reads or writes a credential

#### Scenario: Own brands only
- **WHEN** a key calls any tool with another person's brand
- **THEN** the answer is the same as for a brand that does not exist

### Requirement: Card text by tool
The system SHALL let an agent read the card design of a draft and change only the words on it.

#### Scenario: Partial change
- **WHEN** an agent calls `update_card_text` with `{"title": "Ship less, learn more", "tag": "Field notes"}`
- **THEN** only those two fields of that draft change, the brand's starting design follows, and the whole design is returned

#### Scenario: Draft with its own design
- **WHEN** a draft has its own design and `update_card_text` succeeds
- **THEN** the canvas showing that draft changes

#### Scenario: Aesthetics are refused
- **WHEN** a change names `layout`, `background`, `paletteId`, `sizeId`, `seed`, `titleScale`, `intensity`, `bottomFade`, `showLogo`, `showFooter` or `fonts`
- **THEN** nothing is stored, including any text field in the same call, and the message says the person sets it in the studio

#### Scenario: No path to aesthetics
- **WHEN** the tools are built
- **THEN** the pinned test shows no reachable method that can set a non-text design field

#### Scenario: Too long
- **WHEN** a text field is over the editor's limit
- **THEN** nothing is stored and the message gives the limit

#### Scenario: Images
- **WHEN** a change names `photos`, `screenshot` or `bgImage`
- **THEN** it is refused

#### Scenario: Two writers
- **WHEN** the person and an agent change different fields of a draft at nearly the same time
- **THEN** both changes are kept

### Requirement: Live canvas
The system SHALL show a change made through MCP in every open studio for that brand without a reload.

#### Scenario: Change
- **WHEN** a tool changes a draft
- **THEN** an open studio on that brand shows it within one second

#### Scenario: Typing
- **WHEN** the person has unsaved typing in a field that an arriving change also sets
- **THEN** the person's text stays in that field

### Requirement: Draft text by tool
The system SHALL let an agent create a draft and write its text.

#### Scenario: Partial change
- **WHEN** `update_draft` names only `hashtags`
- **THEN** only the hashtags change

#### Scenario: Old revision
- **WHEN** `update_draft` writes `body` with a revision older than the draft's
- **THEN** it is refused and nothing changes

#### Scenario: Waiting post
- **WHEN** the draft has a post waiting to be sent
- **THEN** the call is refused, as it is for a person

#### Scenario: Published item
- **WHEN** a tool changes a sent post or an article with a live page
- **THEN** it is refused, and nothing changes

#### Scenario: Article with pictures
- **WHEN** `update_draft` writes the body of an article that contains pictures
- **THEN** it is refused

#### Scenario: Restore
- **WHEN** a tool has rewritten a body
- **THEN** the text from before that turn is in the draft's history

### Requirement: Attachment by tool
The system SHALL let an agent set a post to go out with the card or with a video at a public address, under the same checks as the studio.

### Requirement: Brand notes
The system SHALL keep notes an agent saves about a brand in the database.

#### Scenario: Later conversation
- **WHEN** a note is saved and a new conversation starts on the same brand
- **THEN** the agent is given the note

#### Scenario: The person's view
- **WHEN** the person opens the saved notes drawer
- **THEN** they can read, edit and delete every note

### Requirement: Post by tool
The system SHALL let an agent publish a post now, and nothing else about publishing.

#### Scenario: Scope
- **WHEN** a key without the `agent` scope, including an `editor` key, calls `publish_post`
- **THEN** it is refused and nothing is sent

#### Scenario: Agent key elsewhere
- **WHEN** a key with the `agent` scope calls the REST API
- **THEN** it is refused

#### Scenario: Card not ready
- **WHEN** the draft uses the card and no image drawn from the current design is stored
- **THEN** nothing is sent and the message says to open the studio on this brand

#### Scenario: Not connected
- **WHEN** the network is not connected or cannot be posted to
- **THEN** nothing is sent and the message says so

#### Scenario: Failure
- **WHEN** the network refuses the post
- **THEN** the job is recorded as failed with its error and is not retried

#### Scenario: Limit
- **WHEN** ten posts were already made through an agent for the brand that day
- **THEN** a further one is refused
