# Tasks
- [x] Check for whitespace in saved values and for environment overrides (neither applies)
- [x] Split the `invalid_client` / `unauthorized_client` message into causes the person can act on, and show LinkedIn's error code
- [x] A failed app check does not block publishing, and the result says so
- [x] Test: fake LinkedIn server returning `invalid_client` and `unauthorized_client`
- [x] Log the status of each request
- [x] Docs: `docs/social-settings.md` troubleshooting entry
- [ ] Reproduce on the deployed server and read the error code now shown
- [ ] Confirm the introspection request and client authentication against LinkedIn's documentation
- [ ] Confirm a real post goes out with only the token and the author URN
