# A version for every merge

**Status:** built (asked for by the owner on 2026-11-27). Takes effect with the first merge that includes it.

## Why
The running app calls itself `main`. Nothing says which release it is, and no tag marks what was deployed.

## What changes
- A merge to `main` gets the next semantic version: the patch number by default; the minor with the pull request label
  `release:minor`; the major with `release:major`. The first version continues from the highest tag in the history.
- The image carries it (`VERSION`, and an image tag without the `v`); `/healthz` and About show it.
- After the image is published the commit is tagged and a GitHub release lists the merged changes.
- A commit that already has a version keeps it, so a build can be run again safely.
- Pull request builds call themselves `pr-<number>` and publish nothing.

## Out of scope
A hand-written change log, versions for the agent repository, deploying automatically.
