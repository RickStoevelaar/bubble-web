# Deploying bubble-web (owner's Hetzner box)

**Nothing in this repo touches the live box.** No script here SSHes anywhere, edits a Caddyfile, or starts anything remotely.
Deployment happens only when the owner says go, by following this document by hand.

**Not yet verified:** the Dockerfile and `compose.yml` were written on a machine without Docker. The bundle and client were built
exactly as the Dockerfile does and run in the final image's directory layout without `node_modules` (healthz, static files, `/scores`,
websocket join all worked), but `docker build` and `docker compose up` have **not** been run. Expect to fix small things on first build.

## Prerequisites

- Docker with the Compose plugin on the box.
- The external Docker network `web` exists (`docker network ls`). The shared Caddy container is on it and reaches apps by container/service name.
- A clone of this repo on the box.

## 1. Create `.env`

```
cp .env.example .env
```

Set `PIN=` to a long value: **at least 8 characters, alphanumeric**. The server refuses to start with a shorter PIN
(`ALLOW_DEV=1` lifts that for local development only; never set it on the box). The PIN is the only access control for the game
(anyone who reaches the URL and knows it can play), so do not use a word or a date. `.env` is gitignored; never commit it.
`docker compose` refuses to start if `PIN` is missing or empty.

## 2. Data directory

The container runs as the non-root `node` user (uid 1000) and `./data` is mounted at `/data`:

```
mkdir -p data && chown 1000:1000 data
```

`data/` holds `highscores.json`, `unlocks.json` and the suspended runs (continue/resume state, plus `room-*.seats.json`: the rejoin tokens, so a phone can reclaim its hero after a restart).

## 3. Start

```
docker compose up -d --build
docker compose ps            # should become "healthy"
docker compose exec bubbleweb node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>r.text()).then(console.log)"   # ok
```

The service publishes no ports; it is reachable only on the `web` network as `bubbleweb:8080`. To check from the box through Caddy
once routing is done: `curl https://<your-host>/healthz` should print `ok`.

## 4. Routing through Caddy

**STEP 0: READ THE LIVE CADDYFILE ON THE BOX FIRST.** Find it, do not assume where it is:
`docker exec <caddy-container> cat /etc/caddy/Caddyfile`, or look at the container's mounts
(`docker inspect <caddy-container> --format '{{json .Mounts}}'`) and read the file on the host. One Caddy serves several apps.
Follow the existing apps' pattern exactly (host naming, snippets, logging, header conventions). Do not paste the example below blindly.

**EXAMPLE ONLY** (shape of a site block, adapt to what the live file does):

```
bubble.<server-ip-dashed>.sslip.io {
    reverse_proxy bubbleweb:8080
}
```

(`<server-ip-dashed>` is the box's IPv4 with dots replaced by dashes.)

Notes:

- WebSocket upgrades (`/ws`) pass through `reverse_proxy` by default; no extra config.
- `TRUST_PROXY=1` is set in `compose.yml` and deliberately **not** baked into the Docker image (a plain `docker run -p` would then let any client forge
  `X-Forwarded-For` and dodge the per-IP PIN limiter; with `docker run` behind a proxy, pass `-e TRUST_PROXY=1` yourself). It makes the server take the client IP from the proxy's forwarded header. That is
  correct **only** because Caddy is the sole thing in front of the container. If anything else ever fronts it, or the port is published, revisit it.
- Reload Caddy without downtime via its container, e.g. `docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile`
  (look up the right container name and config path on the box first; validate with `caddy validate` the same way if you like).

## Smoke checklist (from a phone, on mobile data, not the LAN)

1. Open `https://bubble.<server-ip-dashed>.sslip.io/` : title screen loads.
2. Join a room with the PIN; a wrong PIN is rejected.
3. Touch controls respond; a round plays; sound starts after the first tap.
4. A second phone joins the same room (co-op).
5. Lock the phone briefly, unlock: you rejoin the run.
6. After a game over, the score appears under high scores (`curl https://<host>/scores`), and `data/highscores.json` exists on the box.

## Operations

- **Logs:** `docker compose logs -f bubbleweb`
- **Update:** `git pull && docker compose up -d --build` (data in `./data` is kept; active rooms are dropped on restart).
- **Rollback:** `git log` to find the previous good commit, `git checkout <commit>`, `docker compose up -d --build`.
  Keep a tag of the image first if you want an instant revert: `docker tag bubbleweb:latest bubbleweb:prev`.
- **Backup:** copy `data/` (`tar czf bubble-data-$(date +%F).tgz data`). Safe to do while running; the files are small.
- **Stop:** `docker compose down` (data stays in `./data`).
- **Change the PIN:** edit `.env`, then `docker compose up -d` (recreates the container).

## Auto-deploy (optional, cron)

`deploy/autodeploy.sh` follows the tracked branch of the clone on the box. Every 5 minutes it fetches, fast-forwards, rebuilds the image
if anything in the image changed (code, lockfile, Dockerfile, compose; not docs/tests/tooling), then health-checks
`https://bubble.167.233.41.250.sslip.io/healthz` through Caddy. Pushing to the tracked branch (`main`) therefore deploys within 5 minutes.
There is no CI gate: a broken commit is live quickly. A rebuild recreates the container, which drops live rooms (suspended runs resume).

One-time setup on the box (after the routing in section 4 exists, or the first health check fails):

```sh
git clone https://github.com/RickStoevelaar/bubble-web.git /opt/bubbleweb/app   # private repo: add a read-only deploy key first
cd /opt/bubbleweb/app && git branch -u origin/main
cp .env.example .env && nano .env        # PIN, >= 8 alphanumeric
mkdir -p data && chown 1000:1000 data
docker compose up -d --build
chmod +x deploy/autodeploy.sh
cp deploy/logrotate.conf /etc/logrotate.d/bubbleweb
crontab -e   # add:
# */5 * * * * /opt/bubbleweb/app/deploy/autodeploy.sh >> /var/log/bubbleweb-autodeploy.log 2>&1
```

It stops and asks for a human on: no upstream configured (`git branch -u origin/main`), tracked local edits on the box, a non-fast-forward
(force-push), a failed rebuild, or a failed health check. On failure the log prints the exact rollback command (last known good commit).
It never rolls back by itself. Watch with `tail -f /var/log/bubbleweb-autodeploy.log`.
