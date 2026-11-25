# Publishing

## ADDED Requirements

### Requirement: Attachment choice
The system SHALL let a post carry one attachment kind: the card (default), one image, several images, one document, or one video.

#### Scenario: Default
- **WHEN** a post is created
- **THEN** its attachment is the card, as before

#### Scenario: Replacing the card
- **WHEN** the user chooses another attachment kind and provides it
- **THEN** that attachment is posted in place of the card, and the card design is kept for a later switch back

#### Scenario: Changing an approved post
- **WHEN** the attachment of an approved post is changed
- **THEN** the post returns to draft and must be approved again

### Requirement: Own image and several images
The system SHALL post one PNG or JPEG image, or several in a set order with alt text each, within the size and count limits.

#### Scenario: Too large or wrong type
- **WHEN** a file is over the limit or is not a PNG or JPEG
- **THEN** it is refused with the reason, and nothing is stored

### Requirement: Document
The system SHALL post one PDF with a title as a LinkedIn document.

#### Scenario: Scheduled document
- **WHEN** a document post is scheduled
- **THEN** the file that was approved is the file that is sent, even if the draft is opened later

### Requirement: Video from a public address
The system SHALL post a video only by fetching it from a public `https` address given by the user. It SHALL NOT accept a video upload from the user's computer and SHALL NOT store the video.

#### Scenario: Address checked on entry
- **WHEN** the user pastes an address
- **THEN** the system reports whether it answers, is a video, and is within the size limit

#### Scenario: Private or unsafe address
- **WHEN** the address, or any redirect from it, points at a private, loopback or non-https host
- **THEN** it is refused and nothing is fetched

#### Scenario: Address gone at send time
- **WHEN** the video cannot be fetched when the post is sent
- **THEN** the job fails before anything is posted and says why; it is not retried

#### Scenario: Processing
- **WHEN** LinkedIn has not finished processing the video within the time limit
- **THEN** the job becomes "needs review" and is not retried

### Requirement: Bounded memory
The system SHALL send documents and videos without holding the whole file in memory.

#### Scenario: Small machine
- **WHEN** the largest allowed video is sent from a 256 MB machine
- **THEN** the server stays within its memory limit

### Requirement: Unchanged safeguards
The system SHALL keep human confirmation, no automatic retries, and "needs review" for unclear outcomes for every attachment kind.
