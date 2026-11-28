# Tasks

## Bolt 1: passwords
- [ ] Refuse common passwords and ones containing the e-mail name; renew cheaper hashes at sign-in
- [ ] Tests

## Bolt 2: sessions end
- [ ] Idle and longest times in the configuration; the server enforces them; cookie hardening
- [ ] Background requests and the event stream do not extend a session; `/auth/session`
- [ ] The app counts use, warns one minute before and goes to sign-in at the end
- [ ] Tests, browser check

## Bolt 3: nothing in browser storage
- [ ] View choices saved on the server; the colours cookie
- [ ] Remove every use of local and session storage, and old keys; a test that keeps it so
- [ ] Tests, browser check

## Bolt 4: security settings
- [ ] Stored settings, API for administrators, sign out everyone
- [ ] Settings → Security
- [ ] Tests, browser check

## Bolt 5: hardening
- [ ] Client address behind a proxy; limit on sign-ups
- [ ] Security headers and content security policy; no caching of API answers
- [ ] Tests, browser check of every screen under the policy

## Bolt 6: security log
- [ ] Migration, recording, list on the Security page
- [ ] Tests, browser check

## Bolt 7: docs
- [ ] User guide, configuration, deployment and data model docs

## Release
- [ ] Deploy (ask first)
