# Analiză completă Linux Doctor 0.5.0 — arhitectură, funcționalitate, bug-uri, compatibilitate

> **Status: problemele grave au fost reparate** (commit-uri `3db847c`, `f71178e`, `0433b57`) — vezi §13 mai jos. Restul (arhitectură, performanță, compatibilitate, teste, UX) rămân recomandări deschise.

> Data: 2026-09-12 · Metodă: 5 analize paralele (arhitectură/module, bug-uri/fețe incomplete, root/`--fix`, performanță/compatibilitate, teste/logging/UX) cu dovezi `file:line`, plus **verificare live personală** pe acest host (Bazzite 44, systemd, Wayland, 16 core). 572/572 teste trec la momentul analizei. Nu s-a modificat cod.
> Complementar: [audit-0.5.0.md](audit-0.5.0.md), [audit-app-delta-2026.md](audit-app-delta-2026.md) (securitate).

## Rezumat executiv

Aplicația are **fundamente solide**: zero dependențe runtime, contract uniform `defineCheck` pentru 49 de checks, scriere atomică pentru tot ce ține de stare, escape/quoting disciplinat, egress validat, escapare corectă în dashboard. Codul e comentat peste medie și are 572 de teste (contract, goldens, paritate, hardening).

Dar are **clasa de probleme tipică unui tool care parsează output de unelte de sistem**: o serie de checks raportează **rezultate false sau nu pot raporta deloc**, iar asta e mai grav decât un crash — un diagnostic care spune „totul e bine" când nu e (sau invers) își pierde rostul.

**Cele mai grave (verificate live pe acest host):**
1. **Profilul mașinii e greșit** — un desktop fără baterie e clasificat „server" (`awk '$2=="seat0"'` citește coloana UID). Se sar exact checks-urile de desktop (wifi, gpu, bluetooth, wayland, audio) și rulează cele de server. `--self-test` pe Bazzite-ul nostru afișa „Profile: server".
2. **`smart/failing` este cod mort** — `smartctl -H` întoarce exit non-zero când discul e FAILED, iar codul face `continue` pe `!res.ok` înainte de a citi stdout. **Un disc care moare nu e raportat niciodată.**
3. **Check-ul de crash minte** — `journalctl --list-boots --since "7 days ago"` ignoră `--since` (verificat: 62 linii „în 7 zile" = 62 total), deci raportează numărul de booți pe viață. Raportul nostru zicea „62 reboots in the last 7 days".
4. **Două checks moarte structural** — `locales/*` (LC_ALL=C forțat maschează exact eroarea căutată) și `fds/*` (comparație cu `fs.file-max` = LONG_MAX).
5. **Detecția „immutable" e greșită pe distro-urile atomice** — `findmnt -T /` întoarce `overlay` pe Bazzite, deci `immutable=false` deși `imageBased=true`; notele de raport și skip-urile atomice se contrazic.

**Riscuri reale de siguranță:** `--fix --yes` execută comenzi distructive (pachete, containere, loguri, firewall) cu o singură poartă booleană; un fals pozitiv (`security/no-firewall` din lipsă de root pe nft) poate activa ufw și tăia SSH-ul. Plugin-urile și modulul Pro sunt `import()`-uri arbitrare — rulate cu `sudo`/root devin execuție de cod ca root.

**Compatibilitate:** merge bine pe Fedora/Debian-family cu systemd, x86_64; **slab/rupt pe Alpine/BusyBox (checks de bază tac), non-systemd, ARM/musl** (runtime-ul bundluit e x64-only).

---

## 1. Arhitectură și organizarea codului

**Harta:** `bin/doctor.js` (12 linii) → `src/cli.js` (orchestrator). `src/*.js` = 33 module (parsare, config, scoring, istoric, randare, I/O, egress). `src/checks/*.js` = 49 checks + `define.js`/`index.js`/`shared.js`. `src-gui/` = dashboard vanilla-JS (index.html e **artefact comis**, generat de `scripts/build-gui.mjs`). `src-tauri/` = shell subțire. `scripts/`, `packaging/`, `tests/`, `docs/`.

**Fluxul real:** argv → `parseArgs` → config/thresholds/ignore → Pro+plugins merge → ~25 comenzi de management (ies înainte de rulare) → `collectReport` (`runPool` cu 4 checks, fiecare fan-out intern) → normalize → ignore → dedupe → scor → `attachHistory` (diff NEW/FIXED) → canale de ieșire (terminal/plain/json/html/md/support/interactive/web/todo/fix/daemon/fleet/alert/heartbeat/notify).

**Puncte bune:** dependențe disciplinate (checks nu importă orchestratorul); `severities.js` = sursă unică pentru severitate/scor; contract `defineCheck` uniform; documentație internă bună.

**Probleme de organizare:**
| ID | Observație | Dovadă |
|---|---|---|
| AR1 | **`src/cli.js` e god-object** — 1086 linii, 28 importuri: argv, config, merge Pro/plugins, toate cele ~25 ramuri de ieșire, bucla daemon, wiring web, attach history ȘI singurul executor de comenzi (`--fix`). | `src/cli.js:1-32,881-905` |
| AR2 | **`scrub()` triplicat** — `src/support.js` + `src-gui/js/export.js` + copia din `index.html` comis; comentariu explicit „keep in sync". La fel `reportMarkdown` (GUI) vs `renderMarkdown` (Node) produc documente diferite. | `support.js:30`, `export.js:2-16`, `markdown.js` |
| AR3 | **Construcția check-list-ului duplicată** în `cli.js` (`--check-list` și callback-ul `--web`); la fel merge-ul de thresholds (`--thresholds-set` vs `POST /api/thresholds`). | `cli.js:585-594,840-849`, `web.js:160-173` |
| AR4 | **Ciclu `cli.js` ⇄ `wizard.js`** (wizard importă `starterConfig` din cli; cli importă dinamic wizard). | `wizard.js:22`, `cli.js:494` |
| AR5 | **`web.js` face I/O la import** (citește index.html) și lansează `xdg-open`; `report.js` (randare) depinde de `history.js`. | `web.js:216,204-211`, `report.js:4` |
| AR6 | **`index.html` comis** și citit la runtime; nimic nu verifică în CI că e proaspăt față de surse. | `web.js:216`, `cli.js:1018` |
| AR7 | Export/cod mort: `resetProfileCache` (0 referințe), `demoWarn` ajunge în pragurile publice deși doar Pro îl folosește, `license.js` importă `loadProModule` dar nu-l cheamă. | `profile.js:21`, `thresholds.js:42`, `license.js:12` |
| AR8 | Categoriile `storage`/`graphics` (raid, gpu-usage) nu există în taxonomia dashboard-ului → cad în „other" în GUI. | `state.js:41-46` vs `checks/raid.js`, `checks/gpu-usage.js` |

## 2. Funcționalitatea reală a modulelor

Contractul e uniform și 49/49 checks sunt înregistrate + documentate (`docs/checks.md`). Verificarea reală arată însă module care **nu-și pot face treaba**:

| Check | Stare reală | Dovadă |
|---|---|---|
| `smart` | **`smart/failing` inaccesibil** — `continue` pe `!res.ok` înainte de testul FAILED; `smartctl -H` iese non-zero exact când discul e FAILED | `smart.js:42-60` (verificat cod) |
| `crash` | Numără booți pe viață, nu în fereastră (vezi §3) | `crash.js:26,43` (verificat live) |
| `locales` | **Dead**: `LC_ALL=C` forțat în `run()` maschează eroarea căutată | `utils.js:38`, `locales.js:18` |
| `fds` | **Nu poate declanșa**: ratio vs `fs.file-max` = LONG_MAX | `fds.js:24-28` |
| `profile` | Clasificare greșită desktop→server (vezi §3) | `profile.js:42` (verificat live) |
| `fs`, `oom`, `hardware` | „ok" dedus din prezența binarului, nu din citire reușită (dmesg_restrict) | `fs.js:16-20,44-54`, `oom.js:15-19` |
| `update`/`packages`/`orphans` | Merge pe apt/dnf/pacman; `rpm -Va` rulat de 2× și ucis de timeout | `packages.js:107` |
| `flatpak`/`snap`/`zypper` | Parsare fragilă: text „All snaps up to date" numărat ca update; flatpak numără linii cu `/` care pot lipsi; zypper `NR>4` sare rânduri | `snap.js:34-45`, `flatpak.js:38-39`, `updates.js:47` |

## 3. Bug-uri și edge cases (verificate live unde e marcat)

| ID | Severitate | Bug | Dovadă / verificare |
|---|---|---|---|
| B1 | **High** | `awk '$2=="seat0"'` citește UID, nu SEAT → orice desktop fără baterie e „server"; se sar checks de desktop | `profile.js:42`, `wayland.js:21`; **verificat**: `loginctl --no-legend` → `1 1000 user seat0 …`; `--self-test` zicea „Profile: server" |
| B2 | **High** | `journalctl --list-boots --since "7 days ago"` ignoră `--since` → „N reboots in the last 7 days" = booți pe viață | `crash.js:26`; **verificat**: 62 linii „în 7 zile" = 62 total; raportul nostru afișa „62 reboots" |
| B3 | **High** | `smart/failing` cod mort (vezi §2) | `smart.js:44-48` |
| B4 | **High** | `immutable` din `findmnt FSTYPE` = `overlay` pe Bazzite → contrazice `imageBased`; note/skip-uri atomice greșite | `system.js:43-44`; **verificat**: `findmnt -no FSTYPE -T /` → `overlay` |
| B5 | Mediu | `autologin` tratează orice match text ca „enabled" (inclusiv `AutomaticLoginEnable=false` sau linii comentate) | `autologin.js:17-19` |
| B6 | Mediu | `nft list ruleset` fără root → „no firewall" fals, poate declanșa fix-ul `ufw --force enable` | `security.js:13`, `ports.js:73` |
| B7 | Mediu | `ssh/ok` fals când `sshd_config` e necitibil (0600 pe RHEL-family) — presupune default-uri sigure | `ssh.js:25,56-65` |
| B8 | Mediu | `memory` hardcodează coloana 6 din `free` (procps); pe BusyBox/vechi → severitate greșită sau panică falsă | `memory.js:29-34` |
| B9 | Mediu | `disk`/`inodes` folosesc `df --exclude-type` (GNU-only) și nu exclud `efivarfs` în loop → fie tac pe Alpine, fie raportează „efivars full" | `disk.js:62-79`, `inodes.js:57` |
| B10 | Mediu | `snap refresh --list` fără update-uri („All snaps up to date.") → 1 update fals | `snap.js:34-45` |
| B11 | Mediu | `oom` numără linii, nu evenimente → un singur OOM = „repetat", high în loc de medium | `oom.js:25-27,44-45` |
| B12 | Mediu | `containerdisk` spune „niciun runtime instalat" când daemon-ul e oprit (contrazice check-ul `containers`) | `containerdisk.js:19-36` |
| B13 | Mediu | `network` tratează absența `getent` (musl/minimal) ca eșec DNS → „DNS resolution is failing" fals | `network.js:62-64` |
| B14 | Mediu | `processes` nu poate produce high (`procHighRatio` nefolosit) | `processes.js:55-70` |
| B15 | Mediu | `--html` ignoră `--severity` (folosește findings nefiltrate) | `cli.js:1015` vs `1066`; **verificat cod** |
| B16 | Mediu | `durations` emis ca **array** în `--json --profile`, dar schema îl declară **obiect**; dashboard-ul îl convertește → cele două canale diferă | `cli.js:1068`, `schema.js:25-29`; **verificat live** |
| B17 | Mediu | `fix.js` verifică `family==="rhel"`, dar `detectDistro` întoarce mereu `"fedora"` → **Fedora/RHEL nu primesc fix pentru updates** | `fix.js:86`, `distro.js:30`; **verificat cod** |
| B18 | Mediu | `--init-config` suprascrie config-ul existent (ignore/thresholds/licenseKey) fără avertisment; wizard-ul se ferește, flag-ul nu | `cli.js:499-508` |
| B19 | Mediu | dedupe/istoric pe `code` comun (disk/full pe două partiții) → NEW/FIXED ratate | `history.js:189-200` |
| B20 | Mediu | `--check <id>` dezactivează silențios istoricul/diff-ul (nedocumentat) | `cli.js:683-702` |
| B21 | Mic | `fst` consideră zram „SSD" (ROTA=0) → numărători/mesaje TRIM false | `fstrim.js:22-25` |
| B22 | Mic | `parseSize` nu înțelege `GiB`/`TiB` (doar `G`,`M`,`T`,`K`) | `utils.js:90-96` |
| B23 | Mic | `boot` măsoară `/` când `/boot/efi` nu e mount separat → „boot/full" duplicat | `boot.js:24-39` |
| B24 | Mic | `timers`/`disk` cu spații în mount/unit → offset/colțuri greșite | `timers.js:31-33`, `disk.js:68` |
| B25 | Mic | Run „dry" (`--fix` fără `--yes`) **nu e fără efecte**: scrie istoric + cache și `dnf check-update` atinge rețeaua | `cli.js:868`, `updates.js:39` |
| B26 | Mic | `err.killed` e raportat ca timeout pentru orice semnal (inclusiv segfault) | `utils.js:51-53` |

## 4. Securitate și rulare cu sudo/root

**Ce e deja bine:** quoting `shq()` peste tot + test static; catalogul de fix-uri e funcție pură de `code`, textul `fix` nu e executat niciodată; `[manual]` nu se execută; scrieri atomice 0600/0700; egress validat (privat/redirect/plaintext); escapare HTML corectă.

**Riscuri:**
| ID | Severitate | Problemă | Dovadă |
|---|---|---|---|
| R1 | **High** | Plugin-urile (`~/.config/linux-doctor/checks/*.js`) și modulul Pro (`LINUX_DOCTOR_PRO_MODULE`) sunt `import()` arbitrar; rulate cu `sudo`/root sau sub `sudo -E` (HOME păstrat) → **execuție de cod ca root** | `plugins.js:32`, `pro.js:68-71`, `paths.js:28-31` |
| R2 | **High** | `--fix --yes` = o singură poartă booleană pentru comenzi distructive (autoremove pachete, `pacman -Sc --noconfirm`, prune containere, vacuum jurnal, `ufw --force enable`); fără confirmare per-comandă, fără rollback; as root `/etc`-wide | `cli.js:883-901`, `fix.js:86-220` |
| R3 | Mediu | `--html`/`--md` scriu cu `writeFileSync` pe cale arbitrară (fără `O_EXCL`, urmărește symlink) — ca root, suprascriere arbitrară | `cli.js:1025,1056` |
| R4 | Mediu | Fals pozitiv `no-firewall` fără root → fix-ul poate tăia SSH-ul (port non-standard/profil OpenSSH lipsă) | `security.js:13`, `fix.js:107-123` |
| R5 | Mediu | `--install-timer` scrie unități **user**, dar ca root cu env păstrat poate activa serviciul în sesiunea altui user; fără try/catch la `systemctl` (spre deosebire de uninstall) | `units.js:99-104,148-164` |
| R6 | Mic | `--web`/`--notify` sub root pot scrie config în `/root` și notifica desktop-ul userului (env păstrat) | `web.js:130-179`, `notify.js:11-13` |

**Concluzie root:** tool-ul **nu cere root** niciodată, dar fără root pierde tăcut coverage (nft/AppArmor/SMART), iar cu root lărgește mult blast radius-ul `--fix` și import-urile de plugin.

## 5. Performanță

| ID | Observație | Dovadă |
|---|---|---|
| P1 | **~110–135 subprocese per rulare** (161 call-sites în checks + 9 în system) | `utils.js:33`, checks |
| P2 | Pool de 4 **checks**, dar fiecare check are fan-out intern necontrolat (~12–16 procese simultane) | `cli.js:37`, `utils.js:141-157`, `packages.js:20`, `security.js:13` |
| P3 | Timeout **per comandă**, fără deadline per check/rulare; bucle secvențiale (smart 4×10s, certs per cert/port, backup/timers per unitate) pot lungi rularea | `utils.js:11-18,33`, `smart.js:42-43`, `certs.js:45-69` |
| P4 | `journal` 64 MiB buffer × până la 4 concurente; la timeout/truncare **nu emite nimic** (fals negativ periculos) | `journal.js:69,82` |
| P5 | Muncă redundantă: firewall de 2×, `journalctl -k` de 4×, `glxinfo` de 2×, `rpm -Va` de 2× (aproape mereu ucis de 8s) | `security.js:13` vs `ports.js:70`, `packages.js:107` |
| P6 | `--help`/`--version`/`--list` încarcă tot graful de module (49 checks) + rulează `detectProfile` (spawn-uri) | `cli.js:1-30`, `cli.js:584,643` |
| P7 | Cache doar pentru 4 checks (updates/flatpak/snap/firmware, 30 min); restul rerulează | `cache.js`, `flatpak.js:20` |

## 6. Compatibilitate distribuții și hardware

**Verdict pe familii:**
| Familie | Verdict | Motiv principal |
|---|---|---|
| Debian/Ubuntu, Fedora/RHEL, Arch, Bazzite/Silverblue | **probabil OK** | apt/dnf/pacman + systemd; gap-uri: `gdm3`, unitatea `ssh`, bootc neinclus în `imageBased` |
| openSUSE (MicroOS/Aeon), SteamOS, NixOS | **îndoielnic** | root read-only/transactional neînțeles; NixOS `pkg unknown` → updates sărite |
| Alpine | **rupt pe checks de bază** | BusyBox `df`/`ps`/`du`/`swapon` → disk/inodes/processes/cache tac; musl fără `getent` → DNS fals |
| Void/Gentoo (non-systemd) | **îndoielnic** | systemd checks sar (unele silențios), xbps/emerge neacoperite |

**Hardware:** x86_64 desktop/laptop/server OK (baterii `energy_full` ratează wear; thermal doar `/sys/class/thermal`; GPU NVIDIA/AMD/Intel acoperite, ARM Mali/Panfrost nu). **Runtime-ul bundluit e x64 glibc-only** → app-ul desktop e rupt pe aarch64/armv7/riscv64/musl (`fetch-node-runtime.mjs:24-25`, `tauri.conf.json:48`).

**Găuri de compatibilitate concrete:** systemd hard-dep (45 call-sites); `backup` ignoră cron deși mesajul zice „timer **or cron**"; `snap` fără systemd → „timer disabled" fals; `fstrim`/`bluetooth` oferă fix systemd-only pe OpenRC/runit; `cache` ignoră `XDG_CACHE_HOME`.

## 7. Teste și ce lipsește

**Stare:** 57 fișiere, **572 teste, toate trec** (~98s), plus goldens (12 snapshot-uri byte-level), contract/paritate/hardening, CI pe Node 20/22/24 + Fedora + `cargo test/clippy`.

**Lipsește:**
1. **Wide mode/detail pane nu rulează niciodată în teste** — ambele sandbox-uri stub `matchMedia → matches:false`; `ui-wide.js`/`ui-detailpane.js` netestate (audit N21).
2. **7 module de checks fără test de comportament**: `fs`, `oom`, `cache`, `boot`, `wifi`, `packages`, `orphans` (rulează doar prin căile generice all-fail/all-empty).
3. **`--fix --yes` (execuția reală), `--daemon`, TTY interactiv, ramurile `truncated`/`missing` din `run()`** — netestate.
4. **CI nu rulează `npm run build:gui`** și nu verifică prospețimea `index.html` față de surse → o modificare GUI fără rebuild trece.
5. **URL state, filtre/no-match, loading/error state, panelul de thresholds, notificări** — netestate; `scripts/check-dashboard.mjs` (singurul browser real) nu e în CI.
6. Teste dependente de mediu (spawn binar real, `/proc`), plus un stub de DNS cu sleep 600ms.

## 8. GUI/UX

Ce e bun: 5 views, master-detail la ≥1440px, 4 teme, taste 1–5, a11y pass, skeleton/empty/error states, URL state, status bar.

| ID | Problemă | Dovadă |
|---|---|---|
| G1 | **Contradicție `__TAURI_INTERNALS__`**: `api.js` detectează desktopul prin acest global, iar comentariul din `lib.rs` spune că nu e definit niciodată. Dacă e adevărat, fereastra nu încarcă datele. Practica (ai văzut findings la scroll) sugerează că funcționează și comentariul e vechi — dar cuplajul e fragil și trebuie simplificat/verificat. | `api.js:2`, `lib.rs:8-15` |
| G2 | **Eroarea „no Node" e mascată și greșit formulată** — răspunsul Rust cu mesajul acționabil e aruncat; UI afișează „Make sure Node.js ≥ 20 is installed" deși app-ul bunduiește Node | `api.js:10-18`, `init.js:128`, `lib.rs:165-172` |
| G3 | **`--html` pierde secțiunea Skipped** (renderSkipped iese pe STATIC_DATA), contrar docs | `render-sections.js:135` |
| G4 | **Docs se contrazic** pe Node: README spune „nimic de instalat", dashboard.md cere `node` pe PATH; mesajul de eroare din app e cel vechi | `README.md:43-46` vs `docs/dashboard.md:124-125` |
| G5 | Fără i18n (totul hardcodat engleză) | — |

## 9. Sistemul de repair/fix și siguranța

**Mecanic bine făcut:** catalog unic, `code → builder`, `UNIT_RE` + `shq` pe singurul input derivat din sistem, tier `apply`/`manual`, `[manual]` niciodată executat, test cu input ostil.

**Probleme:** R2 (o singură poartă `--yes`, comenzi distructive, fără rollback/backup), R4 (fals pozitiv firewall → lockout SSH), B17 (Fedora fără fix de updates), B25 (dry-run-ul are efecte secundare), non-root `sudo` fără TTY → eșec mut (`run()` pipe).

## 10. Logging, error handling, recovery

**Bun:** stdout/stderr separate, JSON rămâne parsabil, exit 0/1/2, scrieri atomice, config corupt avertizează o dată, istoric repair-on-read, `checkErrors` vizibile în toate canalele, daemon rezistent, timeout-uri pe egress.

**Găuri:**
| ID | Problemă | Dovadă |
|---|---|---|
| L1 | **Coduri de ieșire inconsecvente**: `--fix` dry-run iese 0 chiar cu findings high; `--thresholds-set` iese 1 unde restul erorilor de input ies 2; `--push` eșuat suprimă `--json` | `cli.js:883-885,638,978` |
| L2 | **Observabilitate slabă**: fără `--debug`/`--verbose`, fără log file, output-ul brut al comenzilor e aruncat de `run()` → un rezultat greșit nu poate fi reprodus din artefacte | `utils.js:33-64` |
| L3 | `rm` din `--uninstall-timer` nu e în try/catch → poate arunca stack trace din `main` | `units.js:154-159` |
| L4 | `catch` în `fix.js:246` ascunde un bug de catalog fără diagnostic | `fix.js:246` |
| L5 | `/api/history` în afara try/catch (salvat doar de „loadHistory nu aruncă") | `web.js:101-105` |
| L6 | Istoric: read-push-write fără lock → rulări pierdute la concurență | `history.js:111-120` |

## 11. Funcții incomplete sau doar declarate în README/docs

| Claim | Realitate | Dovadă |
|---|---|---|
| `durations` documentat ca obiect | Emis ca array în `--json --profile`; dashboard-ul îl face obiect → canale diferite | `schema.js:25-29`, `cli.js:1068` |
| Ambele comenzi de timer „exit 2 când systemd nu rulează" | `uninstallTimer` nu verifică, întoarce mereu ok | `docs/cli.md:187`, `units.js:140-165` |
| `LINUX_DOCTOR_UPDATES_TTL_MS` pentru `updates` | Guvernează și `firmware` + `flatpak` | `configuration.md:122`, `firmware.js:21`, `flatpak.js:19` |
| Bundle: „config + ultimele 10 rulări" | Fără config (poate avea licenseKey), ultimele 5 scor/counts (am corectat doc-ul deja) | `integrations.md` (actualizat) |
| README „nimic de instalat" | dashboard.md + mesajul din app contrazic | `README.md:43-46` vs `dashboard.md:124` |
| `--self-test` „Tools present" | Listă hardcodată incompletă (findmnt, checkupdates, rfkill, nvme lipsesc) | `cli.js:85-87` |
| `demoWarn` în praguri publice | Doar check-ul Pro demo îl folosește; nedocumentat | `thresholds.js:42` |
| `--check <id>` | Dezactivează silențios istoricul (nedocumentat) | `cli.js:683-702` |
| `--severity` | Filtrează și `--md`/`--plain`, dar `--html` și `--push`/exit code rămân pe setul complet (nedocumentat) | `cli.js:946-948,1015` |
| Markdown din dashboard | E alt document (fără START HERE / Skipped / failed checks) vs `--md` | `export.js:17-51` |
| Categoriile din README/checks | `storage`/`graphics` nu există în GUI | `state.js:41-46` |

## 12. Componente importante lipsă

1. **Fără mod de diagnosticitate** (`--debug`/`--verbose` sau log file) și fără păstrarea output-ului brut al comenzilor — nu poți explica un rezultat greșit.
2. **Fără deadline global/per check** — un check lent nu poate fi mărginit decât per comandă.
3. **Fără i18n** (UI și mesaje).
4. **Fără suport ARM/musl în pachetele desktop** (runtime x64-only) — deși CLI-ul ar putea rula.
5. **Fără detectare de virtualizare/container** (LXC/Proxmox/VMs) → poate inspecta dispozitivele hostului.
6. **Fără auto-update** (deja documentat ca P0 în research-app-needs).
7. **Fără lock la istoric** (rulări concurente pierdute).
8. **Fără verificare în CI a prospețimii `index.html`** și fără browser-check în CI.

---

## Top 15 prioritizat (impact real pe user)

| # | Ce | Tip | Efort |
|---|---|---|---|
| 1 | `smart/failing` inaccesibil — disc în prag de cădere neraportat | Bug, High | S |
| 2 | `crash` numără booți pe viață (finding fals vizibil, „62 reboots/7 zile") | Bug, High | S |
| 3 | `profile` desktop→server (`$2` vs `$4` la loginctl) — checks greșite pe desktop | Bug, High | S |
| 4 | `immutable` greșit pe Bazzite (overlay vs imageBased) | Bug, High | S |
| 5 | `locales` + `fds` structural moarte | Bug, Mediu | S |
| 6 | `nft` fără root → „no firewall" fals (poate declanșa ufw) | Bug+risc, Mediu | S–M |
| 7 | `--fix --yes` o singură poartă pentru comenzi distructive | Siguranță, High | M |
| 8 | Plugin/Pro ca root = execuție cod root | Siguranță, High | S (docs) / M (gating) |
| 9 | Alpine/BusyBox: checks de bază tac; `getent` → DNS fals | Compat, High | M |
| 10 | `ssh/ok` fals când config-ul e necitibil; `fs`/`oom`/`hardware` „ok" din binar | Bug, Mediu | S |
| 11 | Fedora fără fix de updates (`rhel` ireachabil) | Bug, Mediu | S |
| 12 | `durations` array vs schema + `--html` ignoră `--severity` | Contract, Mediu | S |
| 13 | Fără `--debug`/log; output brut aruncat | Observabilitate, Mediu | M |
| 14 | Wide mode/detail pane + 7 checks netestate; `index.html` fără verificare CI | Teste, Mediu | M |
| 15 | `__TAURI_INTERNALS__` contradicție + mesaj „no Node" greșit în app | UX, Mediu | S |

> Nota de onestitate: multe dintre cele de mai sus sunt exact tipul de bug pe care **numai rularea pe hardware variat** îl scoate la iveală — de asta contează `--debug` (#13) și testarea pe distro-uri (CI-ul Fedora există, dar nu și Alpine/non-systemd).

---

## 13. Ce am reparat (2026-09-12)

| Finding | Fix | Verificare |
|---|---|---|
| B3 `smart/failing` cod mort — disc care moare neraportat | health string citit înainte de ramura `!ok` | test nou (FAILED + exit 8) |
| B1 profil desktop→server (`loginctl $2`) | probă `SESSION_PROBE` fără index de coloană, partajată cu wayland | live: `--self-test` → „Profile: desktop" |
| B2 `crash` numără booți pe viață | parse `-o json` + filtrare fereastră 7 zile (fail-safe 0) | live: „15 reboots in 7 days" (era 62) |
| B4 `immutable` greșit pe Bazzite (`overlay`) | `immutable` = composefs/ostree **sau** `imageBased` **sau** bootc | live: `immutable: true`, atomic consistent |
| R4 „no firewall" fals fără root → putea declanșa ufw | `detectFirewall()` partajat: „necunoscut" când nft e needitibil fără root; cod nou `security/firewall-unknown` (fără fix) | teste noi security/ports |
| R2 `--fix --yes` prea permisiv | autoremove pachete, prune containere, ștergere Trash, activare firewall → tier `[manual]` (nu se execută) | test actualizat (toate `manual`) |
| B5/B6 locale/fds moarte | locale rulează fără LC_ALL forțat; fds verifică presiunea per-proces vs `RLIMIT_NOFILE` | teste noi; live: ambele tac corect |

**Efect:** toate rezultatele false/înșelătoare confirmate live (profil, booți, immutable, firewall) sunt corectate, iar lanțul „fals pozitiv → comandă distructivă" din `--fix` este tăiat. 577/577 teste verzi.

## 14. Follow-up-uri rezolvate (2026-09-12, a doua rundă)

| Zonă | Ce s-a făcut | Commit |
|---|---|---|
| Observabilitate | `--debug` / `LINUX_DOCTOR_DEBUG=1`: fiecare comandă + durata + status + tail stdout/stderr pe stderr (stdout rămâne curat) | `311ee03` |
| Performanță/robustețe | `withDeadline()`: fiecare check e limitat la 45s wall-clock; la expirare → `checkErrors`, rularea continuă | `311ee03` |
| Consistență | `--thresholds-set` iese acum 2 (ca orice eroare de input) | `311ee03` |
| Compatibilitate | `getent` lipsă → `network/skipped` (nu „DNS failing" fals); `df` inutilizabil → `disk/skipped`/`inodes/skipped` explicite; `free` fără coloana `available` → fallback `/proc/meminfo`, altfel skip; `fstrim` nu mai numără zram/loop ca SSD | `58bf316` |
| Bug real rămas | `oom` număra LINII, nu evenimente: un singur OOM (2 linii, același pid) = „2 kills" + high. Acum numără pid-uri distincte → 1 eveniment = medium | `661f45a` |
| Teste | `tests/checks-untested.test.js`: oom, wifi, orphans, boot (înainte doar calea generică all-fail) | `661f45a` |
| CI | un picior de matrice rebuild-uiește bundle-ul GUI și pică pe `git diff` — toate testele GUI citesc `index.html` comis, deci un edit fără rebuild trecea | `661f45a` |
| UX | `isDesktop()` detectează și prin `tauri://localhost` (nu doar globalul injectat); erorile serviciului desktop sunt afișate, nu înghițite; mesajul „instalează Node" corectat; exportul static `--html` arată secțiunea Skipped | `71a292c` |

**Rămase deliberat nemodificate** (impact redus / risc mare, documentate în §1–§12): refactor `cli.js`/dedup `scrub`, deduplicarea probelor (`glxinfo`×2, `journalctl -k`×4), teste de comportament pentru `packages`/`fs`/`cache`, suport ARM/musl pentru pachetele desktop, i18n, `check-dashboard.mjs` în CI. 595/595 teste verzi.

## 15. A doua rundă de follow-up-uri

| Zonă | Ce s-a făcut | Commit |
|---|---|---|
| Probe redundante | `packages` (Fedora): eliminat `rpm -Va` (dublu, rezultat nefolosit — muncă moartă, de obicei ucisă de timeout); `orphans` (apt): un singur `apt-get -s autoremove` dă și count și sample; `glxinfo` memoizat per rulare (era spawn-uit de gpu ȘI wayland); `hardware`: un singur `journalctl -k` cu ambele pattern-uri (era 2), grep shell mai portabil decât `journalctl -g` | `08fc95b` |
| Teste | `checks-untested.test.js` extins: oom, wifi, orphans, packages, fs, cache (singurele chiar netestate; boot/hardware erau deja în `checks.test.js`) | `08fc95b` |
| Drift scrub | `scrub-parity.test.js`: rulează **ambele** implementări (Node `support.js` + GUI `export.js`) pe aceleași fixture-uri — triplicarea nu mai poate divergea silențios | `08fc95b` |
| ARM | `fetch-node-runtime.mjs` e conștient de arhitectură (hash-uri pin-uite x64 + arm64, selectate din `process.arch`); o arhitectură nesuportată eșuează explicit | `c15d0e0` |
| Browser check | `check-dashboard.mjs` găsește Chromium-ul caché (nu mai hardcodează versiunea) și dă eroare clară fără browser; adăugat ca pas **pre-tag** în RELEASING.md (nu în CI-ul de PR, care n-are browser) | `c15d0e0` |

### Deliberat NU (cu motiv)
- **Refactor `cli.js` (god-object)**: risc mare de regresie pentru zero beneficiu vizibil userului; documentat, nu atins.
- **Dedup `scrub()` prin cod partajat**: imposibil curat — bundle-ul GUI e un script clasic (fără `export`), iar Node are nevoie de ESM. Am pus în schimb un test de paritate comportamentală, care prinde exact hazardul.
- **i18n**: funcție nouă mare (toate string-urile), nu o remediere; rămâne candidat de roadmap, nu de „fix".
- **Job CI ARM + browser**: scriptul e acum arch-aware, dar adăugarea unui runner arm64 / a unui download de Chromium în fiecare PR aduce cost și fragilitate; pașii sunt documentați în RELEASING.md.
