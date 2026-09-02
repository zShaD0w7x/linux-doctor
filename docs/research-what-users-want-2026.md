# Research: Ce caută lumea la un tool de diagnostic Linux (semnal 2026)

> Data: 2026-09-02 · Metodă: web research pe r/selfhosted, r/homelab, Reddit sysadmin, comparații btop/htop/glances/Netdata, și valul noilor asistenți AI locali (Hosomaki, labwatch, uatu, Eugen, tuxgenie, nix-ai-help, SysAI, bashops-agent) + proiecte noi de monitoring homelab (Lumen, Homelab Monitor, BoxWatch, Nimbus).
> Scop: completăm `docs/research-user-needs.md` (2026-08-28) cu semnal proaspăt și validăm direcția 0.4.x/0.5.x.

## 1. Validare: 0.4.1 e pe drumul cel bun

Mai multe surse noi numesc explicit exact blind-spot-urile pe care le acoperim în 0.4.1:

- **"Container restart loop / crash loop / quietly restarting"** — Netdata ("container crash loop"), Homelab Monitor (cAdvisor: "quietly restarting itself every few minutes while pretending everything is fine"), labwatch ("restart loop detection"), Lumen. → `containers/dead` + `containers/oom` + `containers/restarting` lovesc exact durerea.
- **"A green box but the service is dead"** — r/homelab (un server poate avea CPU 10%, disk liber, toate serviciile verzi, iar serviciul care contează e mort) și HomelabAddiction ("container restarts… pretending everything is fine"). → `services/restart-loop` (unit "activ" care moare în buclă) e exact acest caz la nivel de sistem.
- **"Scheduled jobs that silently stop"** — r/homelab: "cron has been dead since tuesday… or the script exits 0 without doing anything". → complementar cu `timers`/`services`; un viitor check "a job didn't run" ar completa.

**Concluzie:** 0.4.1 nu e doar util, e *diferențiator de piață confirmat* — competitorii mari (Netdata) abia acum adaugă crash-loop alerts, iar noi livrăm read-only, fără daemon.

## 2. Semnal proaspăt: 6 teme recurente

### 2.1 AI "plain-English explanation" e noul câmp de bătălie
Un val de proiecte 2026 fac exact ce face Linux Doctor deja parțial — explică problema în limbaj natural:
- **Hosomaki** ("explain errors… in plain language, no cloud, local Ollama, sanitization strips IPs/hostnames/creds"), **Eugen** (offline, Ollama, 3-tier risk scoring), **uatu**, **bashops-agent** (ReAct local, audit log), **nix-ai-help** (`nixai doctor`), **tuxgenie**, **SysAI**.
- Toate pun accent pe **local-first / privacy-first** (rulează pe Ollama, nicio cheie cloud) și pe **audit + rollback-aware remediation**.
- **Linux Doctor deja are `--ai`**, dar: (a) e cloud (OpenAI/Claude) — contratrend față de valul "local/Ollama"; (b) e un rezumat, nu un "why is X slow?" interactiv.
- **Oportunitate:** facem `--ai` să suporte și un backend **local (Ollama)** și să fie poziționat ca "explicație privată, pe mașină". E un moat pe care-l avem parțial (scrubbing) — dublăm în messaging.

### 2.2 "Set-and-forget + alertă la telefon" e golul homelab
Comunitatea vrea setup minim și notificare pe mobil, nu dashboard de citit:
- r/selfhosted: "easy setup, single container, no config" (BoxWatch), "Slack + Discord + email alerts", "Pushover to my phone", "TV dashboard NOC-style".
- Netdata e respins pentru "too much data, too much RAM"; Zabbix/Grafana pentru "too much setup".
- **Linux Doctor are `--notify` (desktop) + `--install-timer` + `--alert`.** Ce lipsește pentru server-track: **push la telefon** (ntfy / Pushover / email digest). → candidat 0.5.0 (Pro, conform planului din research-user-needs §5.1).

### 2.3 "Green host, dead service" — orbul neacoperit complet
Mai multe surse: verificarea trebuie să confirme că *munca chiar s-a întâmplat* (cron rulează dar scriptul exit 0 fără efect; un serviciu de aplicație e down deși hostul e verde).
- **Linux Doctor azi:** verifică hostul + serviciile systemd, nu *aplicația tau* (endpoint-ul real). Un check viitor `endpoint`/`service-deep` (probează `http://localhost:port` pentru serviciile detectate) ar închide acest orb — dar e complex (trebuie să știm ce să sondăm). **Marcat future / nevoie de design**, nu 0.4.x.

### 2.4 GPU monitoring explodează (boom-ul AI local)
Utilizatorii de Ollama/Stable Diffusion vor per-GPU VRAM/util/temp/power:
- Homelab Monitor (GPU tab per-card, throttle reasons, power→money), btop (GPU NVIDIA/AMD/Intel), Lumen (GPU NVIDIA/AMD), labwatch.
- **Linux Doctor are `gpu` (driver health), nu utilizare.** Un check nou `gpu/usage` (snapshot read-only: VRAM used/total via `nvidia-smi`/`rocm-smi`/`amdgpu` sysfs) e **în scope** (e un snapshot, nu monitoring continuu — ca `memory`/`thermal`) și lovește valul AI-local. → candidat **Free**, 0.4.2 sau 0.5.0.

### 2.5 Onboarding / wizard / mobile-friendly
- labwatch are `init` wizard (auto-detectează containere/servicii, testează notificări, instalează cron); Lumen are onboarding wizard; Hosomaki are shell-integration.
- **Linux Doctor are `--init-config`** dar nu un wizard ghidat first-run. Un `linux-doctor --init` interactiv (alege ce să monitorizeze, testează `--notify`/`--timer`) ar crește adopția pe server-track.

### 2.6 Digest zilnic + anti-flap + dedupe
- labwatch: "smart alerts dedupe + daily digest, per-node grades". Homelab Monitor: "daily plain-English digest".
- **Linux Doctor deja are NEW/FIXED diff + `--notify` (doar la nou).** Formalizăm un "daily digest" (email/ntfy) în 0.5.0 Pro.

## 3. Ce acoperim deja vs. ce e gap (mapare rapidă)

| Nevoie (semnal 2026) | Stadiu Linux Doctor | Acțiune |
|---|---|---|
| Restart-loop / dead container | **0.4.1 (în curs)** | livrăm |
| Explicație plain-English (AI) | `--ai` cloud existent | adăugăm backend **local/Ollama** + messaging privacy |
| Alertă la telefon (ntfy/Pushover/email) | `--notify` doar desktop | 0.5.0 Pro |
| Daily digest anti-flap | NEW/FIXED diff parțial | 0.5.0 Pro |
| GPU VRAM/utilizare (AI rigs) | `gpu` doar driver health | **0.4.2/0.5.0 Free** nou check |
| Endpoint/deep-service health | lipsă | future (design) |
| First-run wizard | `--init-config` | 0.5.0 (Free) |
| Host health (CPU/RAM/disk/inode/mount/net/NTP/Selinux/firewall/updates/journal) | acoperit 1:1 | ✓ (validat de curriculum-ul sysadmin) |
| Privacy / local-first | scrubbing existent (`--md`/`--ai`/`--support`) | dublat în marketing |

## 4. Propunere scope viitoare (prioritizat)

**0.4.2 — „Visibility & AI-private" (Free, mic efort, lovește valul 2026):**
1. `gpu/usage` — snapshot VRAM used/total + utilizare GPU (NVIDIA via `nvidia-smi`, AMD via `rocm-smi`/`amdgpu` sysfs), read-only. Severitate info (sau medium dacă VRAM >90%). *Diferențiator clar vs btop (care e real-time TUI, nu snapshot raportabil).*
2. `--ai` local backend (Ollama) — explanation privată pe mașină, zero cloud. Flag `--ai-provider ollama` + detectare endpoint local.

**0.5.0 — „Server track + livrare" (Pro pentru livrare, Free pentru check-uri):**
3. `certs` / `ports` / `fds` (din research-user-needs §5.2) — Free.
4. Phone push (ntfy/Pushover) + daily digest — **Pro** (conform regula >50% Free).
5. First-run wizard `linux-doctor --init` — Free.

**Beyond (future, necesită design):** `endpoint`/deep-service health, fleet MCP server (labwatch/Homelab Monitor expun deja MCP — Linux Doctor Pro ar putea expune raportul via MCP pentru agenți AI).

## 5. Ce e deliberate NON-GOAL (scope guard din research-user-needs §5)
Păstrăm: nu monitoring continuu (btop/Netdata), nu kill/manage servicii, nu curățenie executată, nu benchmark hardware, nu inventar exhaustiv (inxi). `gpu/usage` e **snapshot**, nu grafic live → rămâne în modelul read-only.

## 6. Verdict de poziționare
Piața 2026 se îndreaptă spre (a) explicație AI privată locală și (b) alertă de telefon set-and-forget. Linux Doctor e singurul cu **score + diff NEW/FIXED + explicații + safe-fix + scrubbing by-default**; adăugând (a) AI local și (b) push la telefon, acoperim ambele valuri fără să părăsim read-only. 0.4.1 (deja în curs) e validat de piață.

## 7. Surse
1. https://www.reddit.com/r/selfhosted/comments/1cj6b5s/easy_tool_to_monitor_server_hardware_cpu_ram_disk/ (netdata prea greu, vrea easy setup)
2. https://www.reddit.com/r/homelab/comments/1eqekqt/what_do_you_guys_use_to_monitor_your_systems/ (lipsă overview, SSH manual)
3. https://r.nf/post/806826 (vrea monitor service+containers, "too much data" la netdata)
4. https://github.com/rbretschneider/labwatch_cli (CLI cron-native, ntfy, certs, restart-loop, heartbeat)
5. https://www.reddit.com/ — Hosomaki / labwatch / Homelab Monitor / Lumen / Nimbus (2026 dashboards + AI plain-English)
6. https://sumguy.com/btop-vs-htop-vs-bottom-top-replacements/ (GPU monitoring cerere)
7. https://ettayeb.fr/en/linux/linux-monitoring-tools/ (btop GPU, Netdata alerting, "container crash loop" pre-wired)
8. https://homelabaddiction.com/homelab-monitoring-with-prometheus-and-grafana/ ("quietly restarting itself", ce să monitorizezi prima dată)
9. https://github.com/rivernova/hosomaki (AI local, sanitization IP/host/creds — privacy-first)
10. https://github.com/mansam-ger/Linux_ai_Helper (Eugen: offline Ollama, health check, 3-tier risk)
11. https://github.com/lsalazarm-sec/bashops-agent (ReAct local, audit log, read-only mode)
12. https://www.reddit.com/ — "basic Linux server health check" sysadmin thread (curriculum: CPU/load, RAM/swap, disk/inode, mounts, net, servicii critice, NTP, SELinux, firewall, journal, updates; overlooked: /var/log size, IPMI, cron realmente rulează)
