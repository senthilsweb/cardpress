# Tasks

## Bolt 1: the session in memory
- [ ] A cache of session, person, roles and limits; the last use written at most every 15 seconds; off by configuration
- [ ] Dropped on sign-out, sign out everyone, role, password, disabling, and security settings
- [ ] Brand owners kept and dropped the same way
- [ ] Tests: a change of role and a sign-out take effect on the next request; the idle time still ends a session; a count of queries per request

## Bolt 2: the prompt cache measured
- [ ] Migration: cached and uncached input tokens per reply, read from the session's usage
- [ ] The cached share on the dashboard
- [ ] Tests, docs
