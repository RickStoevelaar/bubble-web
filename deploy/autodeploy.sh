#!/bin/sh
# Unattended deploy for the Hetzner box: fetch, fast-forward, rebuild the image when
# anything that ends up in it changed, then health-check. Driven by cron every 5
# minutes. See docs/deploy.md ("Auto-deploy").
#
# Unlike a bind-mounted PHP app, this game's code is baked into the image, so every
# change to code, lockfile or packaging needs a rebuild (docs and tests do not).
# Recreating the container drops live rooms; suspended runs resume on rejoin.
#
# There is NO CI gate in front of this: whatever lands on the tracked branch is live
# within 5 minutes. Turn the cron entry off if that stops being acceptable.
#
# Exit codes: 0 = nothing to do, or deployed and healthy. 1 = needs a human.
set -eu

REPO=/opt/bubbleweb/app
COMPOSE_FILE=$REPO/compose.yml
# Through Caddy over public HTTPS, so it exercises the path a player takes. The route
# must exist in the live Caddyfile BEFORE the first deploy, or this reports a failure.
HEALTH_URL=https://bubble.167.233.41.250.sslip.io/healthz
LOCK=/var/lock/bubbleweb-autodeploy.lock

# A rebuild can outlast the cron interval: a second run exits instead of queueing.
if [ "${AUTODEPLOY_LOCKED:-}" != "1" ]; then
    AUTODEPLOY_LOCKED=1
    export AUTODEPLOY_LOCKED
    exec flock -n "$LOCK" "$0" "$@"
fi

log() { echo "$(TZ=Europe/Amsterdam date '+%Y-%m-%d %H:%M:%S %Z') $*"; }

cd "$REPO"

# The branch comes from git's upstream config (git branch -u), not from this file.
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
if [ -z "$UPSTREAM" ]; then
    log "ERROR: no upstream branch configured for '$(git branch --show-current)'."
    log "  Fix: git branch -u origin/<branch>. See docs/deploy.md."
    exit 1
fi

# Never deploy over uncommitted work. .env and data/ are untracked/ignored, so they
# do not count as dirty.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    log "ERROR: tracked local modifications in $REPO; refusing to deploy."
    git status --short --untracked-files=no
    exit 1
fi

git fetch --quiet origin

OLD=$(git rev-parse HEAD)
NEW=$(git rev-parse "$UPSTREAM")

# Nothing new: exit silently (this runs 288 times a day).
[ "$OLD" = "$NEW" ] && exit 0

log "update on $UPSTREAM: $(git rev-parse --short "$OLD") -> $(git rev-parse --short "$NEW")"

# --ff-only: this host is a deploy target, not a place to resolve history.
if ! git merge --ff-only "$UPSTREAM" >/dev/null 2>&1; then
    log "ERROR: not a fast-forward - local history has diverged from $UPSTREAM."
    log "  Inspect with: git -C $REPO log --oneline --graph HEAD...$UPSTREAM"
    exit 1
fi

log "now at: $(git log --oneline -1)"

# Rebuild unless the change touched only docs, markdown, tests or tooling that is not
# in the image (the Dockerfile copies shared/, server/, client/ and the manifests).
if git diff --name-only "$OLD" HEAD \
    | grep -Ev '^(docs/|tools/|deploy/|.*\.md$|.*/test/|\.gitignore$|\.gitattributes$|\.dockerignore$)' \
    | grep -q .; then
    log "image inputs changed -> rebuilding"
    # Capture BuildKit's progress noise; print it only if the build fails.
    BUILD_LOG=$(mktemp)
    if docker compose -f "$COMPOSE_FILE" up -d --build >"$BUILD_LOG" 2>&1; then
        log "rebuild ok"
        rm -f "$BUILD_LOG"
    else
        log "ERROR: rebuild failed - build output follows"
        cat "$BUILD_LOG"
        rm -f "$BUILD_LOG"
        log "  last known good was $(git rev-parse --short "$OLD"); roll back with:"
        log "    git -C $REPO reset --hard $OLD && docker compose -f $COMPOSE_FILE up -d --build"
        exit 1
    fi
else
    log "docs/tests/tooling only -> no rebuild needed"
fi

# Retried, not checked once: a recreated container needs a moment to start listening.
CODE=000
i=0
while [ "$i" -lt 10 ]; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$HEALTH_URL" || echo 000)
    case "$CODE" in
        2??|3??) break ;;
    esac
    i=$((i + 1))
    sleep 3
done

case "$CODE" in
    2??|3??)
        log "health ok (HTTP $CODE)"
        ;;
    *)
        log "HEALTH CHECK FAILED (HTTP $CODE) after deploying $(git rev-parse --short HEAD)"
        log "  last known good was $(git rev-parse --short "$OLD"); roll back with:"
        log "    git -C $REPO reset --hard $OLD && docker compose -f $COMPOSE_FILE up -d --build"
        exit 1
        ;;
esac
