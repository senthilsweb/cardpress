# Tasks

## Bolt 1: passwords
- [x] Refuse common passwords and ones containing the e-mail name; renew cheaper hashes at sign-in
- [x] Tests

## Bolt 2: sessions end
- [x] Idle and longest times in the configuration; the server enforces them; cookie hardening
- [x] Background requests and the event stream do not extend a session; `/auth/session`
- [x] The app counts use, warns one minute before and goes to sign-in at the end
- [x] Tests, browser check

## Bolt 3: nothing in browser storage
- [x] View choices saved on the server; the colours cookie
- [x] Remove every use of local and session storage, and old keys; a test that keeps it so
- [x] Tests, browser check

## Bolt 4: security settings
- [x] Stored settings, API for administrators, sign out everyone
- [x] Settings → Security
- [x] Tests, browser check

## Bolt 5: hardening
- [x] Client address behind a proxy; limit on sign-ups
- [x] Security headers and content security policy; no caching of API answers
- [x] Tests, browser check of every screen under the policy

## Bolt 6: security log
- [x] Migration, recording, list on the Security page
- [x] Tests, browser check

## Bolt 7: docs
- [ ] User guide, configuration, deployment and data model docs

## Release
- [ ] Deploy (ask first)
