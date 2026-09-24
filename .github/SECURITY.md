# Security Policy

linux-doctor inspects a system — it does not change it. It is **read-only by default**, and the report is meant to be safe to share. Security still matters: the tool reads and parses system output and can be pointed at untrusted data.

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting:

**Security → Report a vulnerability** (on this repository).

Helpful in a report:

- what you ran (command + flags) and the linux-doctor version
- the affected check/module, if you can isolate it
- expected vs. actual behaviour
- a minimal reproduction — a scrubbed `linux-doctor --support` bundle is ideal
- whether it needs elevated privileges or a specific distribution/package

Please redact hostnames, usernames, IPs and home paths.

## What counts as a vulnerability

- command/argument injection or unsafe shell expansion in a check
- path traversal, or writes beyond the intended read-only behaviour
- unsafe temp-file handling or privilege escalation
- leaking sensitive data into reports, logs or telemetry
- supply-chain or packaging issues (npm · AUR · OBS · deb · rpm · AppImage)

## What to expect

I'll acknowledge as soon as I can, investigate, and keep you updated. Credit given if you want it.

## Scope

This policy covers the linux-doctor repository and its published packages.
