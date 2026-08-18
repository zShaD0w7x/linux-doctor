# Linux Doctor Pro — commercial license

Linux Doctor is free software under the [GPL-3.0-or-later](LICENSE) — and it
stays that way. Every feature in the open-source repo is free forever, for
everyone, including companies.

**Linux Doctor Pro** is a separate, proprietary product built by the
maintainer on top of the same engine. It is for teams and companies that want
the hosted fleet experience: one place to see every machine's health.

## What stays free (the community edition)

Everything in this repository, forever:

- All 28 built-in checks (memory, disk, services, GPU, network, backups,
  containers, audio, …)
- The terminal report, `--json` (v1 schema), `--plain`, and the `--web`
  dashboard
- Health score, run history, "new/fixed since last check"
- The plugin API — anyone can write their own checks
- `--ai` with your own LLM key, `--push` to your own fleet server

Companies can also buy a one-time **commercial license** for the *community
edition* if they need to embed it in a closed-source product without GPL
obligations (see below).

## What is Pro (paid)

Pro is not in this repository. It is the maintainer's proprietary product:

- **Hosted fleet dashboard** — every machine's reports in one place, with
  per-machine history and trend graphs
- **Alerting** — email/webhook when a machine goes red or a new high-severity
  finding appears
- **Scheduled reporting** — managed cron so machines report without setup
- **AI fleet summaries** — plain-English overview of what changed across the
  fleet
- **Priority support** and premium checks

The Pro client talks to the exact same open-source engine: it uses the plugin
API and the `--push` protocol that the community edition already exposes.
Nothing in the free product is crippled or paywalled to sell Pro — the free
edition is the product, Pro is the hosted service around it.

## Licensing for companies (embedding the community edition)

If you need to use the community edition inside a **proprietary product**
without the GPL's copyleft obligations — for example, shipping the checks
inside a closed-source application — you can purchase a commercial license
from the maintainer.

A commercial license grants the right to use, modify, and redistribute the
community edition in proprietary software, without the copyleft requirements
of the GPL.

## How to buy / contact

Open an issue on [GitHub](https://github.com/zShaD0w7x/linux-doctor-cli/issues)
or email the maintainer for pricing and terms.

## Why dual licensing works

- **Individuals and open-source projects** use Linux Doctor for free under
  the GPL-3.0 — no features removed, no nag screens.
- **Companies** that need closed-source embedding pay for a commercial
  license (MySQL and Qt run the same model).
- **Pro** is a hosted service, not a crippled free product — it is the
  natural next step for the fleet protocol the free client already speaks.
