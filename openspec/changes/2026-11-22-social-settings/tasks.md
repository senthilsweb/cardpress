# Tasks
- [x] `credentials` table, AES-GCM helper, key handling
- [x] GET/PUT `/api/v1/settings/{network}`, POST `.../test`
- [x] Env override and masking
- [x] Settings UI as a right-hand drawer: network tabs, show/hide, developer portal links, frozen footer actions, discard prompt
- [x] LinkedIn test call (against a fake server in tests, and the real endpoint rejecting fake credentials)
- [x] Docs: `docs/social-settings.md`
- [ ] (Test connection now says which value LinkedIn refused; seen: `invalid_client_id` with HTTP 400. A valid answer is still unconfirmed.) Confirm a valid token's introspection response (`active`, `expires_at`, `scope`) with a real LinkedIn app; only a fake server has produced that shape so far
- [ ] Confirm the LinkedIn endpoint and scope names against LinkedIn's current documentation
