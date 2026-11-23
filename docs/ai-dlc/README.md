# AI-DLC record

Backdated on 2026-11-22 (the project start) from the work done so far. These are retrospective records, not contemporaneous ones.

## Intent

Make LinkedIn and blog social cards in my own brand colours and fonts, from a single self-hosted binary, without a design tool.

## Units of work and bolts

| Unit of work | Bolt | OpenSpec change |
|---|---|---|
| Studio and cards | Scaffold: Astro and React, Go-embedded binary, Dockerfile; layouts, sizes, PNG export | [studio-scaffold](../../openspec/changes/2026-11-22-studio-scaffold/proposal.md) |
| Look | The 11 built-in backgrounds; profiles and the brochure palettes | [backgrounds-and-profiles](../../openspec/changes/2026-11-22-backgrounds-and-profiles/proposal.md) |
| Standard theme | 8 cover palettes shared by every profile; saved-profile migration | [standard-theme-palettes](../../openspec/changes/2026-11-22-standard-theme-palettes/proposal.md) |
| Extensibility | Drop-in backgrounds in `card/bg/` | [dropin-backgrounds](../../openspec/changes/2026-11-22-dropin-backgrounds/proposal.md) |
| Typography | Logo small line above or below; per-element Google fonts | [logo-line-and-fonts](../../openspec/changes/2026-11-22-logo-line-and-fonts/proposal.md) |
