# Profiles

## ADDED Requirements

### Requirement: Multiple brands
The system SHALL let one installation hold several brand profiles, each with its own identity, designs, drafts, conversations, publishing queue and social credentials.

#### Scenario: Switching brands
- **WHEN** the person selects another brand
- **THEN** the card, drafts, queue and conversations shown are that brand's, and nothing from the previous brand remains visible

### Requirement: Brand isolation
The system SHALL publish a post only with the credentials of the brand that owns the job.

#### Scenario: Two brands
- **WHEN** brand A has a scheduled post and brand B has different LinkedIn credentials
- **THEN** the post goes out with A's credentials and B's are never read

### Requirement: Safe deletion
The system SHALL NOT delete a brand silently while it has scheduled posts.

#### Scenario: Delete with scheduled posts
- **WHEN** the person deletes a brand with scheduled posts
- **THEN** they are told and must cancel or confirm before anything is removed
