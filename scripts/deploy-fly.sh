#!/usr/bin/env bash
# Deploy CardPress to Fly.io: one always-on machine running the Docker image.
#
#   scripts/deploy-fly.sh up      --app NAME [--region iad] [--turso] [--env-file .env]   first deployment
#   scripts/deploy-fly.sh deploy  --app NAME [--turso]                                   ship a new image
#   scripts/deploy-fly.sh secrets --app NAME [--turso] [--env-file .env]                  sync settings from .env
#   scripts/deploy-fly.sh status|logs --app NAME
#   scripts/deploy-fly.sh backup  --app NAME                                              volume snapshot
#   scripts/deploy-fly.sh destroy --app NAME
#
# Storage: SQLite on a Fly volume (default, fly.toml) or a remote Turso database (--turso, fly.turso.toml).
# Add --dry-run to print what would run without touching Fly. See docs/fly.md.
set -euo pipefail

cd "$(dirname "$0")/.."

CMD="${1:-}"; [ $# -gt 0 ] && shift
APP="${FLY_APP:-}"
REGION="${FLY_REGION:-iad}"
ENV_FILE=".env"
TURSO=0
DRY=0
VOLUME="cardpress_data"
VOLUME_GB="${FLY_VOLUME_GB:-1}"

die() { echo "error: $*" >&2; exit 1; }
say() { echo "==> $*"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --app) APP="${2:?--app needs a name}"; shift 2 ;;
    --region) REGION="${2:?--region needs a code}"; shift 2 ;;
    --env-file) ENV_FILE="${2:?--env-file needs a path}"; shift 2 ;;
    --turso) TURSO=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

CONFIG="fly.toml"; [ "$TURSO" = 1 ] && CONFIG="fly.turso.toml"

# run a command, or just show it with --dry-run
run() {
  if [ "$DRY" = 1 ]; then echo "+ $*"; else "$@"; fi
}

need_app() { [ -n "$APP" ] || die "give the app name with --app NAME (Fly app names are global, so pick a unique one)"; }
need_fly() {
  command -v fly >/dev/null 2>&1 || die "flyctl is not installed: https://fly.io/docs/flyctl/install/"
  if [ "$DRY" = 0 ]; then fly auth whoami >/dev/null 2>&1 || die "not logged in: run 'fly auth login'"; fi
}

app_exists() { [ "$DRY" = 1 ] && return 1; fly status -a "$APP" >/dev/null 2>&1; }
secret_names() { [ "$DRY" = 1 ] && return 0; fly secrets list -a "$APP" 2>/dev/null | awk 'NR>1 {print $1}'; }
has_secret() { secret_names | grep -qx "$1"; }
volume_exists() { [ "$DRY" = 1 ] && return 1; fly volumes list -a "$APP" 2>/dev/null | grep -q "$VOLUME"; }

# Settings copied from the env file to Fly secrets. Only these names are read, and the file is parsed, never executed.
PASSTHROUGH="CARDPRESS_AGENT CARDPRESS_AGENT_ID CARDPRESS_AGENT_ENVIRONMENT_ID CARDPRESS_AGENT_VERSION CARDPRESS_AGENT_BUDGET_CENTS CARDPRESS_AGENT_TIMEOUT ANTHROPIC_API_KEY CARDPRESS_MCP CARDPRESS_MISSED_GRACE CARDPRESS_LINKEDIN_VERSION CARDPRESS_LINKEDIN_API_BASE CARDPRESS_CORS_ORIGINS"
[ "$TURSO" = 1 ] && PASSTHROUGH="CARDPRESS_DB_URL CARDPRESS_DB_TOKEN $PASSTHROUGH"

env_value() { # KEY from the env file: the last uncommented KEY=value line, quotes stripped
  [ -f "$ENV_FILE" ] || return 0
  local line
  line="$(grep -E "^[[:space:]]*$1=" "$ENV_FILE" | tail -n1 || true)"
  line="${line#*=}"; line="${line%%[[:space:]]#*}"
  line="${line%\"}"; line="${line#\"}"; line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

GENERATED_TOKEN=""

# Build the KEY=VALUE list for `fly secrets import` (on stdin, so values never appear in the process list).
secrets_payload() {
  local k v
  for k in $PASSTHROUGH; do
    v="$(env_value "$k")"
    [ -n "$v" ] && printf '%s=%s\n' "$k" "$v"
  done
  # the API token and the encryption key are required on a public address: use the env file, keep what Fly already has, or make new ones
  v="$(env_value CARDPRESS_API_TOKEN)"
  if [ -n "$v" ]; then printf 'CARDPRESS_API_TOKEN=%s\n' "$v"
  elif ! has_secret CARDPRESS_API_TOKEN; then GENERATED_TOKEN="$(openssl rand -hex 24)"; printf 'CARDPRESS_API_TOKEN=%s\n' "$GENERATED_TOKEN"; fi
  v="$(env_value CARDPRESS_SECRET_KEY)"
  if [ -n "$v" ]; then printf 'CARDPRESS_SECRET_KEY=%s\n' "$v"
  elif ! has_secret CARDPRESS_SECRET_KEY; then printf 'CARDPRESS_SECRET_KEY=%s\n' "$(openssl rand -hex 32)"; fi
}

set_secrets() {
  if [ "$TURSO" = 1 ] && [ -z "$(env_value CARDPRESS_DB_URL)" ] && ! has_secret CARDPRESS_DB_URL && [ "$DRY" = 0 ]; then
    die "--turso needs CARDPRESS_DB_URL and CARDPRESS_DB_TOKEN in $ENV_FILE (libsql://<db>-<org>.turso.io and its token)"
  fi
  local payload; payload="$(secrets_payload)"
  if [ "$DRY" = 1 ]; then
    echo "+ fly secrets import --stage -a $APP   (stdin: $(printf '%s\n' "$payload" | sed 's/=.*//' | paste -sd' ' -))"
    return
  fi
  [ -n "$payload" ] || { say "no secrets to change"; return; }
  printf '%s\n' "$payload" | fly secrets import --stage -a "$APP"
  if [ -n "$GENERATED_TOKEN" ]; then
    echo
    echo "A new API token was generated. Save it now, it is not shown again:"
    echo "  CARDPRESS_API_TOKEN=$GENERATED_TOKEN"
    echo "The app asks for it when you first open it."
  fi
}

deploy_image() {
  local args=(-a "$APP" -c "$CONFIG" --ha=false --primary-region "$REGION" --remote-only -y)
  run fly deploy "${args[@]}"
}

case "$CMD" in
  up)
    need_app; need_fly
    say "App $APP, region $REGION, $([ "$TURSO" = 1 ] && echo 'Turso database' || echo "SQLite on a ${VOLUME_GB} GB volume")"
    if app_exists; then say "app $APP already exists"; else run fly apps create "$APP"; fi
    if [ "$TURSO" = 0 ]; then
      if volume_exists; then say "volume $VOLUME already exists"; else run fly volumes create "$VOLUME" -a "$APP" -r "$REGION" -s "$VOLUME_GB" -n 1 -y; fi
    fi
    say "Setting secrets"; set_secrets
    say "Deploying"; deploy_image
    echo; say "Done: https://$APP.fly.dev   (health: https://$APP.fly.dev/healthz)"
    ;;
  deploy)
    need_app; need_fly
    deploy_image
    ;;
  secrets)
    need_app; need_fly
    set_secrets
    [ "$DRY" = 1 ] || say "Staged. Run '$0 deploy --app $APP$([ "$TURSO" = 1 ] && echo ' --turso')' to apply them."
    ;;
  status) need_app; need_fly; run fly status -a "$APP" ;;
  logs)   need_app; need_fly; run fly logs -a "$APP" ;;
  backup)
    need_app; need_fly
    [ "$TURSO" = 0 ] || die "Turso keeps its own backups: see the Turso dashboard or 'turso db shell'"
    if [ "$DRY" = 1 ]; then echo "+ fly volumes snapshots create <id of $VOLUME> -a $APP"; exit 0; fi
    ID="$(fly volumes list -a "$APP" --json | python3 -c 'import json,sys; v=[x for x in json.load(sys.stdin) if x.get("name")=="'"$VOLUME"'"]; print(v[0]["id"] if v else "")')"
    [ -n "$ID" ] || die "no volume named $VOLUME on $APP"
    fly volumes snapshots create "$ID" -a "$APP"
    say "Snapshot requested. List them with: fly volumes snapshots list $ID -a $APP"
    ;;
  destroy)
    need_app; need_fly
    if [ "$DRY" = 0 ]; then
      read -r -p "Destroy app $APP and its volume? This deletes your data. Type the app name to confirm: " ans
      [ "$ans" = "$APP" ] || die "not confirmed"
    fi
    run fly apps destroy "$APP" -y
    ;;
  ""|help|-h|--help) sed -n '2,13p' "$0" ;;
  *) die "unknown command: $CMD (try: up, deploy, secrets, status, logs, backup, destroy)" ;;
esac
