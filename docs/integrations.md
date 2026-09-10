# Integrations

Scripting, reporting, and machine-readable output. For the CLI and downloads,
see the [README](../README.md).

## JSON output (v1 schema)

`--json` prints a versioned payload so scripts can rely on its shape:

- `schemaVersion`, `tool`, `version` — what produced this and which schema it
  follows
- `generatedAt`, `durationMs` — when the checks ran and how long they took
- `system`, `counts`, `score`, `newCount`, `ignoredCount`, `checkErrors`
  (checks that threw — the run always survives a broken check, it is listed
  here instead), `checksRun`/`checksSkipped` (what actually ran — "no
  findings" means no problems, not nothing ran)
- `findings[]` — every finding carries `check` (which check produced it) and
  a stable `code` (e.g. `suspend/system-sleep-hooks`) for scripting and
  ignore rules; `dedupeKey` marks findings that share a root cause with
  another check

```bash
linux-doctor --json | jq '.findings[] | select(.severity == "high") | {code, title, fix}'
```

If the shape ever changes incompatibly, `schemaVersion` is bumped — code that
checks it never breaks silently.

## Support bundle (`--support`)

```bash
linux-doctor --support
# → writes linux-doctor-support-<timestamp>.json
```

Produces a single, shareable file for bug reports: system facts
(`system.atomic` included), the latest findings, and a short history tail
(the last 5 runs — scores and counts only, never their finding text). It is
**privacy-scrubbed** — IP addresses and `/home/<user>` paths are redacted
from every field before anything is written, the machine's hostname and
username are excluded entirely, and the bundle lists exactly what it left
out under `privacy.excluded`, so you can attach it to an issue without
leaking your network or home directory. It contains no config file (which
may hold a license key) and no secrets.

## AI summary (optional)

```bash
LLM_API_KEY=sk-... linux-doctor --ai
```

Works with any OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_MODEL`). If
the AI is unreachable, Linux Doctor silently falls back to the plain report —
the AI is a bonus, never a dependency. `LLM_BASE_URL` goes through the same
egress guard as `--push`: a non-loopback endpoint must be `https://` (the
Bearer key never travels in cleartext), and a private/LAN LLM needs
`--allow-private-endpoint`.

## Alerts & heartbeat [Pro]

`--alert` POSTs a compact JSON payload only when the machine actually
degrades (a high-severity finding, or a new medium/high since the last run).
`--alert` accepts any webhook — the simplest phone push is
[ntfy](https://ntfy.sh) (self-hostable, apps for Android/iOS, no account):

```bash
# Phone push via ntfy (create the topic by simply using it):
linux-doctor --alert https://ntfy.sh/my-server-topic

# Same, on a schedule — the timer only speaks when something NEW breaks:
linux-doctor --install-timer   # runs daily with --notify attached
# or: linux-doctor --daemon --interval 3600 --alert https://ntfy.sh/my-server-topic
```

> **Privacy:** the alert body carries the machine's `hostname` and
> `machineId` (an alert is about a specific machine), and its finding titles
> are scrubbed. A public ntfy.sh topic is readable by anyone who guesses or
> finds the topic name — use a long random topic, a self-hosted ntfy, or any
> other private webhook if that identity matters to you.

`--push` and `--alert` refuse private/LAN address literals (`192.168.x.x`,
`10.x.x.x`, `169.254.x.x`, IPv6 ULA/link-local) by default: a report carries
your findings, so sending it to the wrong internal host should be a decision,
not an accident. A self-hosted server on your network is legitimate — opt in
explicitly:

```bash
linux-doctor --push https://192.168.1.20:8443/reports --allow-private-endpoint
```

All four egress paths (`--push`, `--alert`, `--heartbeat`, `--ai`) also
refuse to follow HTTP redirects, so an allowed URL cannot silently bounce the
payload to an internal target. `--push` scrubs every finding's text (title,
detail, evidence, fix) and the AI summary before sending; the machine's
`hostname` and `machineId` remain, by design, so a fleet can tell machines
apart.

`--heartbeat` is the complement: a dead-man's switch. After every completed
run it sends a bare GET (no body — liveness only, nothing sensitive leaves
the machine) to a service that alerts on *silence* (Healthchecks.io,
BetterStack). If the timer is deleted, the box goes offline, or the run
itself breaks, the pings stop and the external service raises through its
own notification path — the monitor that watches the watchers:

```bash
linux-doctor --heartbeat https://hc-ping.com/your-uuid
```

## Fleet reporting (enterprise)

```bash
linux-doctor --push https://your-server/reports
```

Sends the report as JSON to a central endpoint, so a company can collect
health data from every machine in one place. The payload carries the
machine's hostname plus a **stable `machineId`** (from `/etc/machine-id`), so
a fleet dashboard can recognize a machine across reinstalls of the agent.
When the client has history, the payload also includes `diffSinceLast`
(`added`/`fixed`) — the fleet server gets change detection without
recomputing it. Optional auth via `FLEET_API_KEY` (sent as a `Bearer` token).
Pairs well with cron:

```bash
0 9 * * * linux-doctor --push https://your-server/reports
```

The client is free and open-source. The hosted fleet dashboard — one place to
see every machine's issues, with alerting — is the paid enterprise service.
The open-source [COMMERCIAL-LICENSE.md](../COMMERCIAL-LICENSE.md) explains
the licensing options for companies that want to embed Linux Doctor in their
own products.
