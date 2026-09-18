# Limitations, and what it got wrong

Two lists, because both matter when you decide how much to trust a
diagnostic: what it does not do, and what it got wrong (in both directions)
and now has a test for.

## What it does not do

- **Not monitoring.** No metrics, no alerting, no background agent unless you
  run the Pro one. It answers "what is wrong right now", not "how is it
  trending".
- **Not a security audit.** It checks a handful of exposure basics (firewall,
  root SSH, SELinux/AppArmor state). It is not Lynis or OpenSCAP, and it does
  not pretend to be.
- **Not a hardware inventory.** No `inxi`-style report of every controller and
  revision.
- **It does not run the fixes it prints.** The `fix` line is advice. `--fix` is
  a dry run, `--fix --yes` executes only the catalogued `[apply]` tier, and
  `[manual]` commands are never executed at all.
- **It does not clean or optimise.** No cache deletion, no "speed up your PC".
  Those tools have a reason to find dirt; this one should not.
- **Linux only.** No macOS, no Windows.
- **Inside a container it reports the container's world, not the host's.**
  Block devices and mounts from the host can leak into what a check sees
  (`fstrim` is the known example), and systemd is usually absent, so
  systemd-based checks report a skip or nothing. That is a limitation of the
  environment, not a verdict about the host.
- **Some checks degrade instead of guessing.** A check that needs root says
  `skipped (needs root)` rather than claiming a clean result (the `apt` health
  check does this), and a check whose tool is missing stays silent or reports a
  skip.

## What it got wrong, and how it is guarded now

All of these were reported by users, caught by CI, or found by auditing every
check against real input, and each one now has a regression test. Listed
oldest first within each table.

### False positives (a problem reported where there is none)

| What you saw | Why the check was wrong | What guards it now |
|---|---|---|
| `fs/btrfs-errors` on a system with no btrfs filesystem ([#13](https://github.com/zShaD0w7x/linux-doctor/issues/13)) | the dmesg pattern matched the bare word `BTRFS`, which the kernel prints at boot as a module load banner on every build with btrfs compiled in | the pattern requires a real event, the banner is rejected explicitly, and `BTRFS critical` / `failed` / `corrupt` still match |
| `hardware/ecc` on a machine with no ECC memory | the check matched the EDAC driver's own init lines, including `EDAC ie31200: No ECC support`. It was the top item in the report and cost 9 points | classification requires an actual CE/UE event or an `error` token, and routine init lines are rejected |
| `hardware/mce` reporting a machine check exception on healthy hardware | `mce: CPU supports N MCE banks` is printed once per CPU at boot on every Intel machine, and a bare `mce` match read it as an exception | same classifier: routine boot lines are rejected, `[Hardware Error]` lines are not |
| `packages/broken` when run without root ([#14](https://github.com/zShaD0w7x/linux-doctor/issues/14)) | `apt-get check` cannot take the dpkg frontend lock unprivileged, and its refusal was folded into the same string and matched as broken dependencies. The report also contradicted itself, claiming 0 updates in the same output | the lock refusal is dropped, the check requires a real dependency diagnostic, and the healthy finding says `skipped (needs root)` instead |
| `packages/broken` on a clean Arch system ([#19](https://github.com/zShaD0w7x/linux-doctor/pull/19)) | `pacman -Dk` prints "No database errors have been found!", and a bare `error` match caught the word "errors" in that sentence | the success line is dropped and the predicate requires a real diagnostic |
| `packages/locked` accusing the tool itself, only when run as root ([#24](https://github.com/zShaD0w7x/linux-doctor/issues/24)) | the lock probe ran beside linux-doctor's own `apt-get check` (and the `updates` / `orphans` probes), so `fuser` found linux-doctor holding the lock and the user was told to wait for, or kill, a process that was the tool | holders inside linux-doctor's own process group are ignored, and the evidence lists PIDs only |
| `updates` reporting roughly double the real number on dnf | `dnf check-update` prints a header, indented obsoletion lines and one entry per enabled repo, so 314 pending updates read as 630 | unique package names are counted |
| `journal` reporting thousands of "unrecognized entries" after a few crashes | a multi-line entry (a crash plus its stack trace) was counted once per continuation line | only timestamped head lines count as entries |
| `security/autologin` on a machine with autologin disabled | the commented `# AutomaticLoginEnable=true` example that several distros ship was read as config, and an explicit `false` or a bare `[Autologin]` header counted too | comments are ignored, GDM needs an actual true value, and SDDM needs a `User=` line inside the section |
| a full root filesystem reported as a full `/boot` | `df -P /boot` prints the root row when `/boot` is a directory on `/` and the columns are identical, so a 95%-full root was filed against `/boot` | a row is only used when its mount point is the one requested |
| `crash` reporting a kernel panic on machines that reboot often | the Intel machine-check boot banner (`Intel machine check reporting enabled on CPU#N`) was read as a panic | it defers to the same classifier as `hardware/mce`, which rejects routine init lines |

Three more that were fixed before anyone reported them: the webview could come
up blank where WebKit's DMA-BUF renderer fails, `updates` could claim "up to
date" when the package manager was actually locked, and an uncorrected memory
error (an EDAC `UE` line) was filed at medium as if it had been corrected — it
is high now, with its own wording.

### False negatives (a real problem the check missed)

| What you did not see | Why the check was blind | What guards it now |
|---|---|---|
| `security/autologin` said nothing on Debian, Ubuntu and Mint | the probe listed `/etc/gdm` (the Red Hat, openSUSE and Fedora layout) but not `/etc/gdm3`, which the Debian family uses, so an enabled autologin read as no autologin | both layouts are searched, which is only safe because the comment filter above drops the commented examples Debian ships |
| `flatpak` said "apps are up to date" with updates pending | the default `remote-ls --updates` output is a column table whose fields contain no `/`, and that is what the count looked for | it asks for `--columns=application,version`, with a table fallback for older flatpak |
| `raid` called a `FAULTED`, `UNAVAIL`, `REMOVED` or `SUSPENDED` ZFS pool healthy | only the word "degraded" was recognised, so anything worse fell through to the healthy branch | only `ONLINE` counts as healthy, and a running scrub is no longer called a rebuild |

## How we catch these now

- A **clean-image gate** runs the engine inside Fedora, Debian, Ubuntu, Alpine
  and Arch containers and fails when a high or medium finding appears that the
  baseline does not justify.
- **Recorded fixtures** from real machines replay through the same pipeline,
  and every high/medium finding they produce needs a written reason.
- The **severity rubric and the code registry** stop a severity from drifting
  silently.
- **Every check is audited against real input**, and a wrong result is
  reproduced before it is changed: no fix lands without a regression test that
  fails first.
- See [docs/doctrine.md](doctrine.md) for the full list of what is enforced,
  and [docs/compatibility.md](compatibility.md) for what counts as a
  user-visible change.

## Found something wrong?

Please report it: a wrong finding is the most useful bug report this project
can get. Attach a [`--support`](integrations.md) bundle (privacy-scrubbed), or
record a replayable fixture from your machine with `LINUX_DOCTOR_RECORD` as
described in [CONTRIBUTING.md](../CONTRIBUTING.md).
