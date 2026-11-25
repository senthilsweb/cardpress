# Chat

## MODIFIED Requirements

### Requirement: The agent prepares content only
The agent in the chat MAY change the words on a card, write a post or an article and, with the person's confirmation, publish a post. It SHALL NOT change how a card looks (layout, colours, background, fonts, sizes, branding), schedule, cancel or delete anything, or change a brand's profile or credentials.

#### Scenario: Words by conversation
- **WHEN** the person writes "change the title to Ship less, learn more"
- **THEN** the title on the canvas changes while the reply is being written, and the reply says what was changed

#### Scenario: Asked for a look
- **WHEN** the person writes "use the quote layout and make the title bigger"
- **THEN** nothing about the look changes, and the reply says these are set in Edit, Design

#### Scenario: Too long for the look
- **WHEN** the person says the title does not fit
- **THEN** the agent offers shorter wording and does not change the title size

#### Scenario: Undo
- **WHEN** the person writes "undo that"
- **THEN** the agent restores the values it changed in its last turn

## ADDED Requirements

### Requirement: The agent knows what is on screen
The system SHALL send the linked drafts, the item on screen and what to write with each message, the card of a draft the first time it appears, and what the person changed by hand since the agent last saw it.

#### Scenario: Start
- **WHEN** the person designs a card and then starts a conversation
- **THEN** the first message contains that design and its revision

#### Scenario: Edited mid-conversation
- **WHEN** the person changes the background and then sends a message
- **THEN** the message says the background changed

#### Scenario: Viewing the article
- **WHEN** the article is on screen and the person writes "shorten the title"
- **THEN** the title on the article's card changes

### Requirement: Agents from the agent repository
The system SHALL run the chat on the agents described by the manifest of `social-card-agent`.

#### Scenario: No manifest
- **WHEN** the managed agent is selected and the manifest cannot be read
- **THEN** the server refuses to start and says what is missing

#### Scenario: Not reachable
- **WHEN** the server has no public https address
- **THEN** the demo agent answers and the chat says why

### Requirement: First draft meets a rubric
The system SHALL have the first draft of each kind the person ticks graded against that kind's rubric and revised until it passes or three rounds are used.

#### Scenario: Both
- **WHEN** Post and Article are both ticked
- **THEN** the post is written and graded, then the article, and each shows its own verdict

#### Scenario: Later turns
- **WHEN** the person replies after a first draft
- **THEN** the reply is an ordinary turn and is not graded

### Requirement: Cost is measured
The system SHALL record what each conversation with the managed agent costs.

#### Scenario: After a turn
- **WHEN** a turn ends, also when it was stopped or failed
- **THEN** the session's cumulative cost, running time and tokens are stored for that conversation

#### Scenario: Shown
- **WHEN** a conversation has a recorded cost
- **THEN** the chat shows it

### Requirement: Confirmation before posting
The system SHALL ask the person before a post is sent from the chat, unless the server is set to post without asking.

#### Scenario: Ask
- **WHEN** the agent calls `publish_post`
- **THEN** the chat shows the text, the network and the card, with Post and Cancel, and nothing is sent until Post

#### Scenario: Cancel
- **WHEN** the person chooses Cancel
- **THEN** nothing is sent and the agent is told it was declined

#### Scenario: Left the page
- **WHEN** the person leaves while a confirmation is waiting
- **THEN** nothing is sent, and the question is shown again when they return

### Requirement: Acts as the person
The system SHALL run the agent's tools with the signed-in person's own access.

#### Scenario: Another person's brand
- **WHEN** the agent is asked to change a brand the person cannot see
- **THEN** the tool answers that it does not exist

#### Scenario: Revoked
- **WHEN** the person revokes the assistant's key in Account settings
- **THEN** the agent's tools stop working until the next chat makes a new key
