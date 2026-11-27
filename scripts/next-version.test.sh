#!/usr/bin/env bash
# Checks scripts/next-version.sh in a throwaway repository.
set -euo pipefail
script="$(cd "$(dirname "$0")" && pwd)/next-version.sh"
dir="$(mktemp -d)"
trap 'rm -rf "$dir"' EXIT
cd "$dir"
git init -q -b main
commit() { git -c user.name=t -c user.email=t@example.test -c commit.gpgsign=false commit -q --allow-empty -m "$1"; }
tag() { git -c tag.gpgsign=false tag "$1"; }
check() { local want="$1"; shift; local got; got="$("$script" "$@")"; [ "$got" = "$want" ] || { echo "want $want, got $got ($*)" >&2; exit 1; }; }

commit one;   check v0.1.0
tag v0.1.9;   check v0.1.9                      # tagged already: the same version again
tag note-x
commit two;   check v0.1.10                     # a patch, counted as a number
check v0.2.0 release:minor
check v1.0.0 release:minor release:major        # the larger step wins
check v0.1.10 bug enhancement
tag v0.2.0-rc1; check v0.1.10                   # only plain versions count
tag v0.10.0;  commit three; check v0.10.1       # highest by number, not by text
echo "next-version: all checks passed"
