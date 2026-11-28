# Tasks

## Bolt 1: the session in memory
- [x] A cache of session, person, roles and limits; the time of use written at most every 15 seconds; off by configuration
- [x] Forgotten on sign-out, sign out everyone, role, password, disabling, a person's details and security settings
- [x] Tests: each change takes effect on the next request; the idle time still ends a session; a change by another process is seen
- Not done: brand owners are read each time (see the proposal)

## Bolt 2: the prompt cache measured
- [ ] Migration: cached and uncached input tokens per reply, read from the session's usage
- [ ] The cached share on the dashboard
- [ ] Tests, docs
