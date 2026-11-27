#!/bin/sh
# Takes pictures of a throwaway CardPress with example data (needs a built binary: go build -o bin/cardpress . at the root).
#   ./run.sh          the home-page animation, out/demo.gif
#   ./run.sh shots    the user guide's screenshots of brands, accounts, calendar and backgrounds
set -e
cd "$(dirname "$0")"
case "${1:-demo}" in
  demo) exec node record.mjs ;;
  shots) exec node shots.mjs ;;
  *) echo "usage: ./run.sh [shots]" >&2; exit 2 ;;
esac
