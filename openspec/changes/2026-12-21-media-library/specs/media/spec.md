# Media library

## ADDED Requirements

### Requirement: Assets belong to a brand
#### Scenario: Another brand
- **WHEN** a person opens a brand's library
- **THEN** only that brand's assets are listed, and another person's brand answers as missing

### Requirement: Videos are links
#### Scenario: Upload a video file
- **WHEN** a video file is dropped on the library
- **THEN** it is refused, and a public web address can be added instead

### Requirement: Used assets are kept
#### Scenario: Delete
- **WHEN** an asset used by a card is deleted
- **THEN** it is refused and the card is named
