# Tasks
- [x] `credentials` table, AES-GCM helper, key handling
- [x] GET/PUT `/api/v1/settings/{network}`, POST `.../test`
- [x] Env override and masking
- [x] Settings UI as a right-hand drawer: network tabs, show/hide, developer portal links, frozen footer actions, discard prompt
- [x] LinkedIn test call (against a fake server in tests, and the real endpoint rejecting fake credentials)
- [x] Docs: `docs/social-settings.md`
- [ ] Confirm a valid token's introspection response (`active`, `expires_at`, `scope`) with a real LinkedIn app; only a fake server has produced that shape so far
- [ ] Confirm the LinkedIn endpoint and scope names against LinkedIn's current documentation
