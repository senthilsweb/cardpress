# Brand assistant settings

## ADDED Requirements

### Requirement: Models per brand
An administrator SHALL be able to choose, per brand, the model of the coordinator and of each writer from the models
the server allows.

#### Scenario: A stronger article writer
- **WHEN** an administrator sets a brand's article writer to another allowed model and saves
- **THEN** new conversations of that brand write articles with it, and other brands are unchanged

#### Scenario: An open conversation
- **WHEN** the models change while a conversation is open
- **THEN** that conversation keeps the models it started with

#### Scenario: A model that is no longer allowed
- **WHEN** a saved model is removed from the allowed list
- **THEN** our model is used and the settings page says so

#### Scenario: Not an administrator
- **WHEN** a person who is not an administrator, or an API key, changes models, checks or budget
- **THEN** it is refused

### Requirement: Checks per brand
#### Scenario: Off
- **WHEN** checks are off for a brand
- **THEN** a first draft is written without grading

#### Scenario: Rounds
- **WHEN** checks are on with a number of rounds from 1 to 5
- **THEN** the grader sends a draft back at most that many times

### Requirement: Writing guides
A brand's guide SHALL replace our house style for its kind, and SHALL NOT change the record format, limits, tools or
safety rules.

#### Scenario: Saving a guide
- **WHEN** a guide within the rules is saved
- **THEN** it becomes a new version and the next conversation's writer uses it

#### Scenario: Text outside the rules
- **WHEN** a guide is too long, contains HTML, code blocks, or text shaped like our context blocks or tool names
- **THEN** the save is refused with the reason

#### Scenario: A guide that is not about writing
- **WHEN** the check on save finds instructions other than how to write
- **THEN** the save is refused with the reason

#### Scenario: A guide against the format
- **WHEN** a guide tells the writer to break a limit or the record format
- **THEN** the draft still has to pass the fixed lines of the rubric

#### Scenario: Restore
- **WHEN** an earlier version is restored
- **THEN** it becomes the newest version

#### Scenario: No guide
- **WHEN** a brand has no guide for a kind
- **THEN** our house style is used

### Requirement: Budget per brand
#### Scenario: Alert
- **WHEN** a brand's spending in the month passes its alert percentage
- **THEN** one notice is recorded and the chat, the dashboard and the settings page show it

#### Scenario: Used up
- **WHEN** nothing is left of a brand's amount
- **THEN** a new request is refused with the reason, until the amount is raised or the month ends

#### Scenario: During a request
- **WHEN** a request reaches what is left
- **THEN** the session pauses and the chat says the budget is used up

#### Scenario: The server's amount
- **WHEN** nothing is left of the server's amount
- **THEN** every brand's requests are refused

#### Scenario: No amount
- **WHEN** a brand has no amount
- **THEN** only the server's amount and the limit per conversation apply
