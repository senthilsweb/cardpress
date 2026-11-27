#!/usr/bin/env bash
# Prints the version of the commit that is checked out, as vMAJOR.MINOR.PATCH.
#
#   scripts/next-version.sh [label...]      labels of the pull request that was merged
#
# A commit that already has a version tag keeps it. Otherwise the highest version tag in its history goes up by one:
# the major number with the label release:major, the minor with release:minor, else the patch.
set -euo pipefail

releases() { grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1; }

here="$(git tag --points-at HEAD | releases || true)"
if [ -n "$here" ]; then echo "$here"; exit 0; fi

last="$(git tag --list 'v*' --merged HEAD | releases || true)"
if [ -z "$last" ]; then echo "v0.1.0"; exit 0; fi

IFS=. read -r major minor patch <<<"${last#v}"
case " $* " in
  *" release:major "*) echo "v$((major + 1)).0.0" ;;
  *" release:minor "*) echo "v${major}.$((minor + 1)).0" ;;
  *) echo "v${major}.${minor}.$((patch + 1))" ;;
esac
