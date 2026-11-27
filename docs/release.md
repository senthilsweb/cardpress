# Release, back up and restore

How a CardPress release reaches a Fly.io app: the web app first, then the agents when they changed. For a first
installation see [Deploy to Fly.io](fly.md); for running it elsewhere, [Deployment](deployment.md).

`APP` is your Fly app and `VOL` its volume id (`fly volumes list -a $APP`).

```bash
APP=my-cardpress
```

## Before every release

1. The pull request is merged and its checks passed.
2. Read what it changes: a new database migration, a new card field or a new content schema version affects
   [rolling back](#roll-back).
3. Nothing important is due in the next few minutes: the app restarts, and the scheduler with it. A post up to 15
   minutes late is still sent (`CARDPRESS_MISSED_GRACE`).

## 1. Wait for the image

A merge to `main` builds the image and publishes it to GitHub's registry (about 7 minutes).

```bash
git switch main && git pull --ff-only
SHA="$(git rev-parse HEAD)"
RUN="$(gh run list --workflow ci --commit "${SHA}" --json databaseId -q '.[0].databaseId')"
gh run watch "$RUN" --exit-status
DIGEST="$(gh run view "$RUN" --log | grep '"containerimage.digest"' | tail -1 | grep -oE 'sha256:[0-9a-f]{64}')"
echo "$DIGEST"
```

## 2. Back up

```bash
fly image show -a $APP                     # note the running image: it is the way back
scripts/deploy-fly.sh backup --app $APP    # a snapshot of the volume
fly volumes snapshots list VOL             # wait until the new one says "created"
```

Fly also takes a snapshot each day and keeps them for 5 days.

## 3. Deploy

The published image runs as a non-root user, and a Fly volume is owned by root, so it is deployed through a two-line
Dockerfile in an empty folder, with the repository's `fly.toml`.

```bash
set -e                                     # stop at the first error
OUT="$(mktemp -d)"
git show "${SHA}:fly.toml" > "$OUT/fly.toml"
test -s "$OUT/fly.toml"                    # never deploy an empty file
grep -A2 '^\[mounts\]' "$OUT/fly.toml"     # the volume must be named here
printf 'FROM ghcr.io/senthilsweb/cardpress@%s\nUSER 0:0\n' "$DIGEST" > "$OUT/Dockerfile"
(cd "$OUT" && fly deploy -a $APP -c fly.toml --ha=false --remote-only)
```

!!! danger "Check the file before deploying"
    With an empty or wrong `fly.toml`, Fly replaces the machine with one that has **no volume and no settings**, and the
    site is down until it is deployed again correctly. The data stays on the volume. Write the variable as
    `"${SHA}:fly.toml"`: in some shells `$SHA:fly.toml` without braces is read as something else and leaves the file empty.

## 4. Check

```bash
fly machine list -a $APP        # one machine, started, with the volume id in VOLUME
curl -s https://$APP.fly.dev/healthz          # ok main
curl -s https://$APP.fly.dev/api/v1/info      # "needsSetup": false, and the agent "ready"
fly logs -a $APP --no-tail | tail -20
```

Then sign in and open the Library: the posts are there.

## 5. The agents, when they changed

Done in the agent repository (its `docs/deploy.md` has the commands):

1. Deploy the web app **first** whenever the content schema changed: an older app refuses a manifest that names a field it
   does not have, and will not start the assistant.
2. Look at the plan, apply, build the manifest, and give it to the app:

```bash
fly secrets set -a $APP "CARDPRESS_AGENT_MANIFEST=$(jq -c . manifest.json)"   # restarts the app
```

3. Check again as in step 4. **Keep the manifest file**: it is the way back.

Conversations already open keep the agent version they started with.

## Roll back

### The web app
Deploy the image noted in step 2, with the same folder:

```bash
printf 'FROM registry.fly.io/%s@sha256:PREVIOUS\nUSER 0:0\n' "$APP" > "$OUT/Dockerfile"
(cd "$OUT" && fly deploy -a $APP -c fly.toml --ha=false --remote-only)
```

- Database migrations only move forward. If the release added one, restore the snapshot too.
- An older app refuses what it does not know: roll the agent manifest back with it if the content schema changed, and
  expect cards saved with a new layout or field to be refused when edited.

### The agents
Set the manifest kept from the previous release (it names the earlier agent version and its rubrics):

```bash
fly secrets set -a $APP "CARDPRESS_AGENT_MANIFEST=$(jq -c . previous-manifest.json)"
```

## Restore the data

!!! warning "Rehearsed in part"
    Restoring a snapshot into a new volume and starting CardPress on it was rehearsed on 2026-11-27, in a separate app
    (below). Replacing the machine of the **live** app, as these steps do, has not been run. Rehearse first.

A snapshot is restored into a **new volume with a new name**, so the present volume is left untouched.

```bash
fly volumes snapshots list VOL                       # pick the snapshot
fly machine stop MACHINE -a $APP                     # the site goes down here
fly volumes create cardpress_restore --snapshot-id SNAPSHOT -a $APP --region iad --size 1
# in $OUT/fly.toml set: [mounts] source = "cardpress_restore"
fly machine destroy MACHINE -a $APP                  # the machine holds no data; both volumes remain
(cd "$OUT" && fly deploy -a $APP -c fly.toml --ha=false --remote-only)
```

Check as in step 4. Then commit the new volume name to `fly.toml`, or later releases would look for the old one. Delete
the old volume only when you are sure.

**The encryption key** (`CARDPRESS_SECRET_KEY`) must be the same as when the data was saved, or stored social
credentials cannot be read. Keep a copy somewhere safe; a snapshot does not contain Fly secrets.

## Rehearse a restore

Restores into a **separate, private app**, so the live one is never touched. The copy holds real data: keep it private,
give it new keys, and delete it afterwards. It costs one small machine and volume while it exists.

```bash
DRILL=my-cardpress-drill
fly volumes snapshots list VOL                      # a new snapshot takes a while to appear: wait for "created"
fly apps create $DRILL
fly volumes create cardpress_restore --snapshot-id SNAPSHOT -a $DRILL --region iad --size 1 -y
```

In the copy of `fly.toml`, set `[mounts] source = "cardpress_restore"`, remove the whole `[http_service]` section so
nothing is public, and add a health check:

```toml
[checks.http]
  type = "http"
  port = 8080
  path = "/healthz"
  interval = "15s"
  timeout = "5s"
```

```bash
# new random keys: the copy cannot read stored social credentials, so it cannot publish. No assistant settings.
printf 'CARDPRESS_SECRET_KEY=%s\nCARDPRESS_API_TOKEN=%s\nCARDPRESS_SIGNUP=closed\n' \
  "$(openssl rand -hex 32)" "$(openssl rand -hex 24)" | fly secrets import --stage -a $DRILL
(cd "$OUT" && fly deploy -a $DRILL -c fly.toml --ha=false --no-public-ips --remote-only)
fly ips list -a $DRILL                              # must be empty
fly proxy 18190:8080 -a $DRILL                      # then open http://localhost:18190
```

Check that `/api/v1/info` says `"needsSetup": false`, sign in, and compare the Library with the live app. Then delete
the copy, which removes its volume:

```bash
fly apps destroy $DRILL
```

## A copy off Fly

Snapshots live with Fly. For a copy of your own, at a quiet moment:

```bash
for f in cardpress.db cardpress.db-wal; do fly ssh sftp get /data/$f "backup/$f" -a $APP; done
sqlite3 backup/cardpress.db 'PRAGMA integrity_check;'
```

The server may be writing while the files are copied, so check the result, and repeat if it is not `ok`. This has not
been rehearsed either.

## Release record

Write down for each release: date, commit, image digest, snapshot id, the previous image digest, the agent version and
where its manifest is kept.
