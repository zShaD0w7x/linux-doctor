# Linux Doctor Pro — commercial license

Linux Doctor is free software under the [GPL-3.0-or-later](LICENSE) — and it
stays that way. Every free feature in the open-source repo is free forever,
for everyone, including companies.

**Linux Doctor Pro** is the paid tier around it: a license key that unlocks
premium client features shipped in this repo (deep-diagnostic checks,
alerting, a scheduled agent), plus the maintainer's hosted fleet service for
teams and companies that want one place to see every machine's health.

## What stays free (the community edition)

Everything in this repository, forever:

- All 30 free built-in checks (memory, disk, services, GPU, network, backups,
  containers, audio, …)
- The terminal report, `--json` (v1 schema), `--plain`, and the `--web`
  dashboard
- Health score, run history, "new/fixed since last check"
- The plugin API — anyone can write their own checks
- `--ai` with your own LLM key, `--push` to your own fleet server

Companies can also buy a one-time **commercial license** for the *community
edition* if they need to embed it in a closed-source product without GPL
obligations (see below).

## Pro (a license key unlocks client features + the hosted service)

There are two Pro offerings:

**1. In-repo Pro features (license key).** Five premium checks (`hardening`,
`scrub`, `boottime`, `connets`, `journalcap`), the `--alert` webhook, the
`--daemon` scheduled agent, and advanced `--ai` action plans ship in this
repository but only activate with a valid HMAC-signed license key. Without a
key the free edition does not list, run, or even know about them — nothing is
crippled, Pro is additive. The maintainer sells subscriptions; the key format
is public (`ldpro.v1.…`, signed with the documented secret) and keys are tied
to a subscriber, not a machine.

**2. Hosted fleet dashboard (service).** The maintainer's proprietary,
closed-source product:

- **Hosted fleet dashboard** — every machine's reports in one place, with
  per-machine history and trend graphs
- **Managed scheduled reporting** — machines report without you setting up cron
- **AI fleet summaries** — plain-English overview of what changed across the
  fleet
- **Priority support**

The hosted service talks to the exact same open-source engine: it uses the
`--push` protocol and the license-key features that the community edition
already exposes. Nothing in the free product is crippled or paywalled to sell
Pro — the free edition is the product, Pro is the additive tier plus the
hosted service around it.

## Licensing for companies (embedding the community edition)

If you need to use the community edition inside a **proprietary product**
without the GPL's copyleft obligations — for example, shipping the checks
inside a closed-source application — you can purchase a commercial license
from the maintainer.

A commercial license grants the right to use, modify, and redistribute the
community edition in proprietary software, without the copyleft requirements
of the GPL.

## How to buy / contact

Open an issue on [GitHub](https://github.com/zShaD0w7x/linux-doctor/issues)
or email the maintainer for pricing and terms.

## Why dual licensing works

- **Individuals and open-source projects** use Linux Doctor for free under
  the GPL-3.0 — no features removed, no nag screens.
- **Subscribers** buy a Pro license key for the premium client features
  (deep-diagnostic checks, alerting, the scheduled agent, advanced AI).
- **Companies** that need closed-source embedding pay for a commercial
  license (MySQL and Qt run the same model).
- **Pro** is additive, not a crippled free product — it is the natural next
  step for the fleet protocol the free client already speaks.
