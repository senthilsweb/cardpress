# Studio scaffold

> Backdated record, written 2026-11-22.

## Why
Social cards were made by hand in a design tool, each time from scratch.

## What changes
An Astro and React studio (`web/`) embedded into a single Go binary (`main.go`), with a Dockerfile and `make dev | build | run | release`. Layouts: hero, centred, article cover, quote, big number, headshot. Network sizes and caption limits. PNG export through html-to-image.

## Out of scope
Accounts, a server-side store. All state lives in the browser.
