# Security

## ADDED Requirements

### Requirement: Passwords
Passwords SHALL be stored only as salted argon2id hashes.

#### Scenario: A weak password
- **WHEN** a new password is common, or contains the name part of the person's e-mail address
- **THEN** it is refused with the reason

### Requirement: Sessions end
#### Scenario: Without use
- **WHEN** nothing is done for the idle time (20 minutes by default)
- **THEN** the next request is refused and the app goes to sign-in

#### Scenario: In all
- **WHEN** a session reaches its longest time
- **THEN** it ends even if in use

#### Scenario: Background refresh
- **WHEN** only background requests arrive
- **THEN** the session is not extended

#### Scenario: Warning
- **WHEN** one minute is left
- **THEN** the app offers to stay signed in

### Requirement: Nothing in browser storage
#### Scenario: Using the app
- **WHEN** a person signs in, changes the theme and changes how a list is shown
- **THEN** local and session storage are empty, and the choices are the same on another browser

### Requirement: Security settings
#### Scenario: Sign-up closed
- **WHEN** an administrator closes sign-up
- **THEN** it takes effect at once, without a restart, and the sign-in page offers no sign-up

#### Scenario: Not an administrator
- **WHEN** anyone else, or an API key, asks for the security settings
- **THEN** it is refused

### Requirement: Behind a proxy
#### Scenario: Failed sign-ins
- **WHEN** the client address header is configured
- **THEN** failures are counted for each client, not for the proxy

### Requirement: Security log
#### Scenario: Failed sign-in
- **WHEN** a sign-in fails
- **THEN** the time, e-mail and address are recorded, and no password
