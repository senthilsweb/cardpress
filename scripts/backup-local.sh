#!/usr/bin/env bash
# Copies the database of a CardPress app on Fly.io to this machine, and checks the copy.
#
#   scripts/backup-local.sh APP [folder]        default folder: data/backups (git-ignored)
#
# The copy holds personal data: keep it private. Stored social credentials in it can only be read with the app's
# CARDPRESS_SECRET_KEY, which is not part of the copy.
set -euo pipefail
cd "$(dirname "$0")/.."

APP="${1:-}"
[ -n "$APP" ] || { echo "usage: scripts/backup-local.sh APP [folder]" >&2; exit 2; }
for tool in fly sqlite3; do command -v "$tool" >/dev/null || { echo "$tool is needed" >&2; exit 1; }; done

umask 077
dir="${2:-data/backups}"
mkdir -p "$dir"
out="$dir/$APP-$(date -u +%Y%m%dT%H%M%SZ).db"
tmp="$(mktemp -d "$dir/.copy.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT

get() { fly ssh sftp get "/data/$1" "$2" -a "$APP" >/dev/null; }

# The server may write while the files are copied. The database file only changes when the write-ahead log is folded
# into it, so: copy it, copy the log, copy it again, and keep the pair only if the database did not change.
for attempt in 1 2 3; do
  rm -f "$tmp"/*
  get cardpress.db "$tmp/copy.db"
  get cardpress.db-wal "$tmp/copy.db-wal" 2>/dev/null || true   # there may be no log
  get cardpress.db "$tmp/again.db"
  if cmp -s "$tmp/copy.db" "$tmp/again.db" &&
     sqlite3 "$tmp/copy.db" 'PRAGMA wal_checkpoint(TRUNCATE);' >/dev/null &&
     sqlite3 "$tmp/copy.db" 'PRAGMA journal_mode=DELETE;' >/dev/null &&   # one file, with nothing beside it
     [ "$(sqlite3 "$tmp/copy.db" 'PRAGMA integrity_check;')" = ok ]; then
    mv "$tmp/copy.db" "$out"
    echo "Saved $out ($(du -h "$out" | cut -f1 | tr -d ' ')), integrity ok"
    sqlite3 "$out" "SELECT 'brands ' || (SELECT count(*) FROM profiles) || ', drafts ' || (SELECT count(*) FROM drafts) ||
      ', posts sent or waiting ' || (SELECT count(*) FROM publish_jobs) || ', accounts ' || (SELECT count(*) FROM users) ||
      ', schema ' || (SELECT count(*) FROM sqlite_master WHERE type = 'table') || ' tables';"
    exit 0
  fi
  echo "The database changed or the copy did not check out (attempt $attempt), trying again" >&2
  sleep 5
done
echo "No consistent copy was made. Try again at a quieter moment." >&2
exit 1
