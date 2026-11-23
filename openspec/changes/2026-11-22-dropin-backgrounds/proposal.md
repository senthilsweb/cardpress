# Drop-in backgrounds

> Backdated record, written 2026-11-22.

## Why
Adding a background meant editing the registry and a type union.

## What changes
Any `web/src/card/bg/*.tsx` that default-exports a `BackgroundDef` is loaded with `import.meta.glob` at build time and listed before "Plain". `_`-prefixed files are ignored; a matching `id` replaces a built-in. Shared types and helpers moved to `card/bgkit.ts`; `BackgroundId` became `string`. A sample (`waves.tsx`) ships. Documented in `docs/adding-backgrounds.md`.

## Alternatives considered
A runtime manifest with dropped SVG files, recoloured through palette tokens. Not needed: a rebuild is acceptable.
