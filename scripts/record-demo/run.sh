#!/bin/sh
# Starts a clean CardPress on a temporary database, records, and stops it.
#   ./run.sh video|gif     (needs a built ../../cardpress binary: go build -o cardpress ../..)
set -e
cd "$(dirname "$0")"
BIN=${CARDPRESS_BIN:-../../bin/cardpress}
D=$(mktemp -d)
$BIN -addr 127.0.0.1:18300 -db "file:$D/cardpress.db" >"$D/server.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$D"' EXIT
sleep 2
node record.mjs "${1:-video}"
