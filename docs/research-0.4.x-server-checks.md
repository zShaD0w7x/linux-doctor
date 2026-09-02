# Research: 0.4.x — check-uri server (Free)

> Data: 2026-09-02 · Metodă: audit cod (`src/checks/*`, `index.js`, `findings.js`, `define.js`) + web research pe comenzile read-only + reconciliere cu `docs/research-user-needs.md` §2.2 / §5.2.
> Decizie (conversation): targetăm **0.4.x, Free, server track**. Secțiunea `[Unreleased]` din CHANGELOG e goală; v0.4.0 e deja tag-uit (2026-08-28).

## 0. Starea curentă (ce avem deja)

- **Registry**: `src/checks/index.js` — 44 de check-uri, împărțite pe categorii contigue (`system`, `software`, `security`, `network`, `updates`, `hardware`, `data`). Orice check nou se adaugă aici + se înregistrează codurile în `tests/codes-registry.test.js` (enforced: severitate + categorie per cod).
- **Pattern check**: `defineCheck({ id, title, category, appliesTo, skipOnAtomic, run })` + `finding({ severity, code, title, detail, evidence, fix, confidence })`. `finding()` aruncă la formă invalidă → contract test `tests/contract.test.js` prinde bug-urile.
- **Root-gating existent**: `smart.js` e modelul — tool lipsă → `info/<id>/skipped`, permisiune refuzată → `info/<id>/needs-root`, altfel tace. Toate check-urile propuse urmează același model (sunt read-only fără root, dar degradează grațios).
- **Distro**: `pkgInstall(ctx.dist, tool)` pentru mesajul de fix când un tool lipsește.
- **Generare docs**: `scripts/generate-check-docs.mjs` regenerează `docs/checks.md` (catalog auto). Completions nu se ating (zero flag-uri noi).

## 1. Fezabilitate per check

### 1.1 `raid` — RAID degradat / rebuild (HIGH impact, FREE)
- **Surse date (read-only, fără root)**:
  - `cat /proc/mdstat` — listează array-urile și starea membrilor (`[UU_]`, `(F)`, `recovery = 12%`). Read-only pur.
  - `mdadm -D --test <dev>` — exit code nenul dacă degradat; `--test` nu scrie nimic.
  - ZFS: `zpool status` (tool `zfs`); `state: DEGRADED` / `ONLINE` + coloana `STATE` per device. Read-only.
- **Skip grațios**: fără `mdadm` și fără `zfs` → `info/raid/skipped`. Fără array-uri active → tace.
- **Coduri propuse**: `raid/degraded` (**high** — risc de pierdere date), `raid/rebuilding` (medium — recovery în curs, vigilență), `raid/skipped` (info), `raid/ok` (info).
- **appliesTo**: `server` (desktop/laptop rar au RAID software; `--check=raid` îl forțează oriunde). `skipOnAtomic: true` (Bazzite/Silverblue — array-urile sunt evaluate altundeva).
- **Fix exemplu**: `sudo mdadm --detail /dev/md0` + înlocuire disk + `sudo mdadm /dev/md0 -a /dev/sdX`; pentru ZFS `sudo zpool status` + `sudo zpool replace`.
- **Cross-distro**: mdadm pe toate distro-urile systemd; ZFS pe Fedora (apex)/Ubuntu (zfsutils). Fără tool → skipped, nu eroare.

### 1.2 `containers/dead` — containere moarte / OOM (HIGH impact, FREE) — *extinde `containers.js`*
- **Surse date (read-only)**:
  - `podman ps -a --format '{{.Names}} {{.Status}} {{.ExitCode}}'` — status `Exited (137)`, `Restarting`, `Created` (blocat).
  - `docker ps -a --format '...'` — similar; `Exited (137)` = semnătura OOM (SIGKILL).
- **Coduri propuse** (adiționale la cele din `containers.js`): `containers/dead` (medium — ieșit cu exit non-zero), `containers/oom` (**high** — exit 137, OOM signature), `containers/restarting` (medium — stuck restarting).
- **appliesTo**: toate (un container mort pe desktop e la fel de relevant). Rulează doar dacă runtime-ul e prezent (logica existentă din `containers.js` deja decide `ready`/`none`).
- **Fix exemplu**: `podman logs <name>` pentru cauză; `podman start <name>`; pentru OOM → crește memoria cgroup / corectează leak-ul.
- **Notă**: e complet read-only (`ps` nu pornește containere). Se integrează în check-ul existent, nu fișier nou.

### 1.3 `services/restart-loop` — crash loop cu lumină verde (HIGH impact, FREE) — *extinde `services.js`*
- **Sursă date (read-only, fără root)**: `systemctl show <unit> -p NRestarts --value` pentru unit-urile de interes + `systemctl list-units --type=service` filtrat pe substate `auto-restart`.
- **Strategie ieftină & robustă**: pornește de la lista de unit-uri deja greșite (`--failed`, deja colectată în `services.js`), adaugă cele cu SubState `auto-restart` (parse din `systemctl list-units --state=active --type=service` și grep `auto-restart`), apoi pentru fiecare `systemctl show -p NRestarts`. Prag: `NRestarts >= 3` → crash loop.
- **Coduri propuse**: `services/restart-loop` (**high** — un serviciu "running" care de fapt moare în buclă e blind-spot-ul #1 confirmast în research).
- **appliesTo**: toate.
- **Fix exemplu**: `systemctl status <u>` + `journalctl -u <u> --since "30 min ago"` pentru eroarea root; `sudo systemctl edit <u>` să crească `RestartSec`.
- **Notă**: se adaugă în `services.js` (același fișier), nu check nou — evită dublarea listării unit-urilor.

### 1.4 `certs` — expirare certificat TLS (MEDIUM-HIGH impact, FREE)
- **Surse date (read-only)**:
  - Local: iterează `/etc/letsencrypt/live/*/cert.pem` și rulează `openssl x509 -in <cert> -noout -enddate` → calculează zile rămase. Fără root (cert-urile sunt world-readable de regulă).
  - Live: pentru fiecare port TLS care ascultă local (417: vezi `ports`), `echo | openssl s_client -connect 127.0.0.1:<port> -servername <host> 2>/dev/null | openssl x509 -noout -enddate` — prinde cert-ul *deployat* (nu cel din fișier).
- **Coduri propuse**: `certs/critical` (**high** — expirat sau <7 zile), `certs/expiring` (medium — <30 zile), `certs/none` (info — fără certbot/fără TLSListening), `certs/ok` (info).
- **appliesTo**: `server`.
- **Risc / limitare**: enumerarea cert-urilor on-disk e "fuzzy" (multe locații posibile). Decizie de scope: **pornim de la `/etc/letsencrypt/live` + porturile TLS locale detectate**; nu scormonim `/etc/nginx` etc. (prea opinionated). Tool `openssl` lipsă → `skipped`.
- **Fix exemplu**: `sudo certbot renew --dry-run` (test); `sudo certbot renew` (real); pentru cert-uri non-LE: re-emite prin tool-ul respectiv.

### 1.5 `ports` — servicii risky expuse fără firewall (MEDIUM impact, FREE, cel mai opinional)
- **Surse date (read-only)**: `ss -tlnp` + `ss -ulnp` → socket-uri listening. Cross-ref cu `security/no-firewall` (deja existent): dacă firewall-ul e oprit ȘI un port risky ascultă pe `0.0.0.0`/interfață publică → medium.
- **Porte "risky"** (whitelist, nu blacklist): DB/coloană — `3306`(mysql), `5432`(pg), `6379`(redis), `27017`(mongo), `9200`(elastic), `11211`(memcached), `22`(ssh pe public fără chei e acoperit de `ssh`), `23/21`(telnet/ftp). 
- **Coduri propuse**: `ports/exposed-risky` (medium), `ports/ok` (info).
- **appliesTo**: `server`.
- **Risc**: potențial zgomot dacă utilizatorul vrea expunerea. Atenuare: **doar porte din whitelist**, severitate medium (nu high), și doar când firewall-ul e inactiv. Dacă firewall-ul e activ, portul e raportat info/ok (responsabilitatea e la firewall).
- **Decizie**: cel mai bun candidat pentru **0.4.2**, nu 0.4.1 (necesită cross-ref cu `security` și e opinional).

### 1.6 `fds` — file-descriptor exhaustion (MEDIUM impact, FREE)
- **Sursă date (read-only, fără root)**: `cat /proc/sys/fs/file-nr` → `allocated free max`. Raport = `allocated / max`. Praguri: `>0.95` → high, `>0.90` → medium. (Pe 2.6+, `free` e mereu 0, deci `allocated` = în uz — raportul e semnificativ.)
- **Opțional**: inotify `max_user_watches` vs uz (numărarea uzului e scumpă — walk `/proc`; lăsat info/viitor).
- **Coduri propuse**: `fds/exhausted` (high dacă >95%, medium dacă >90%), `fds/ok` (info).
- **appliesTo**: `server` (subiectul e "server moarte misterios").
- **Fix exemplu**: identifică procesul cu multe FD-uri (`ls /proc/*/fd | wc -l`), apoi crește `fs.file-max` via `sysctl` sau corectează leak-ul.

## 2. Mapping pe misiune (scope guard)

Toate cele 6 întăresc pilonii **"diagnostică"** și **"explică"** (niciunul nu violează read-only; niciunul nu e monitorizare real-time, curățenie executată sau benchmark). Sunt complementare la btop/inxi, nu concurente — exact poziționarea produsului.

| Check | Pilon | Read-only | Root | Tool dep | Riscul cel mare |
|---|---|---|---|---|---|
| `raid` | diagnostică | ✅ | nu | mdadm/zfs | fals-pozitiv dacă parse greșit `/proc/mdstat` |
| `containers/dead` | diagnostică | ✅ | nu | podman/docker | zgomot dacă `Exited (0)` e "ok" — excludem exit 0 |
| `services/restart-loop` | diagnostică | ✅ | nu | systemd | prag NRestarts prea mic → fals-pozitiv |
| `certs` | explică | ✅ | nu | openssl | enumerare on-disk fuzzy → scope restrâns |
| `ports` | explică | ✅ | nu | ss | opinionated → doar whitelist + doar fără firewall |
| `fds` | diagnostică | ✅ | nu | (kernel) | `file-nr[0]` e high-water pe unele kernel-uri vechi → verificăm ratio doar pe 2.6+ |

## 3. Plan de release (propus)

### 0.4.1 — "Server blind-spots" (trio de înaltă încredere)
- `raid` (fișier nou `src/checks/raid.js`)
- `containers/dead` + `containers/oom` + `containers/restarting` (extinde `containers.js`)
- `services/restart-loop` (extinde `services.js`)

**De ce mai întâi:** sunt check-urile cu dovada de daune din research (RAID "14 zile pierdute", container 137/OOM "red herring", restart-loop "running but useless"), zero opinie subiectivă, read-only fără root, și se integrează în check-uri deja existente (mai puțin risc de regresie). Generează word-of-mouth pe r/selfhosted imediat.

### 0.4.2 — "Exposure & expiry" (mai opinional)
- `certs` (fișier nou `src/checks/certs.js`)
- `ports` (fișier nou `src/checks/ports.js`)
- `fds` (fișier nou `src/checks/fds.js`)

**De ce după:** `certs` necesită scope restrâns (LE + porturi locale), `ports` necesită cross-ref cu `security`, `fds` necesită validare ratio pe kernel-urile țintă. Mai multă suprafață de opinie → merită un ciclu propriu cu feedback.

### Efort estimat
- Fiecare check nou: ~0.5–1 zi implementare + teste (fișier `.test.js` per check + intrare `codes-registry.test.js` + regen `docs/checks.md` + actualizare tabel README "What it checks").
- Extinderile (`containers`, `services`): ~0.5 zi fiecare (logica e deja acolo).
- **Total 0.4.1 ≈ 3–4 zile.** **Total 0.4.2 ≈ 4–5 zile.**

### Guard-uri de calitate (obligatorii, ca la orice check nou)
- `tests/codes-registry.test.js`: fiecare cod nou pinned la `(severitySet, category)`.
- `tests/contract.test.js`: formează `finding()` — trece automat dacă folosim `finding()`.
- `tests/output-drift.test.js` + `tests/output-parity.test.js`: nu se sparg (nu schimbăm schema, doar findings noi).
- `tests/golden/*`: doar dacă schimbăm wording la check-uri existente (extinderile NU schimbă wording-ul vechi).
- `open-core.test.js`: toate Free → fără impact.

## 4. Următorul pas
Propun să începem implementarea **0.4.1** (raid + containers/dead + services/restart-loop): creez fișierele, le înregistrez în `index.js`, adaug testele și actualizez `docs/checks.md` + README. Vrei să proceed cu 0.4.1, sau vrei mai întâi să ajustezi scope-ul (de ex. să mut `certs` în 0.4.1)?

## 5. Surse
1. https://tldp.org/HOWTO/Software-RAID-HOWTO-6.html (citire `/proc/mdstat`, `mdadm -D --test`)
2. https://unix.stackexchange.com/questions/28636/how-to-check-mdadm-raids-while-running (`mdadm -D` exit code, `/sys/class/block/md*`)
3. https://aruljohn.com/blog/monitor-lets-encrypt-certificate-expiry-dates/ (openssl x509 -enddate pe /etc/letsencrypt/live)
4. https://linuxtoday.net/scripts/check-ssl-cert-expiry/ (`openssl s_client -servername` live cert, SNI, exit-code gating)
5. https://how2.sh/posts/how-to-debug-a-systemd-crash-loop-with-journalctl/ (`systemctl show -p NRestarts`, `Result`, substate auto-restart)
6. https://www.ssdnodes.com/learn/systemd-restart-policies-explained (`NRestarts` + `MainPID`, restart-loop blind spot)
7. https://docs.kernel.org/6.12/admin-guide/sysctl/fs.html (`/proc/sys/fs/file-nr` allocated/free/max)
8. https://serverfault.com/questions/485262/ (semantică file-nr pe 2.6+)
9. `docs/research-user-needs.md` §2.2 / §5.2 (dovada de daune: RAID, container 137, restart-loop)
