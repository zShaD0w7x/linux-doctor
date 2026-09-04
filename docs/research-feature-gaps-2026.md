# Research: Feature gaps la competitori (muniție roadmap 0.5.0+)

> Data: 2026-09-04 · Metodă: web research pe issue-trackere și comparații (Uptime Kuma 662 issues deschise, Beszel issues, selfhosting.sh, vmorecloud, trendboxgeek, hyperping).
> Filtru: intră doar ce trece scope guard-ul din `research-user-needs.md` §5 (diagnostică → explică → sugerează fix → ține minte → livrează; read-only; NU monitoring continuu, acțiuni directe, benchmark, inventar hw).

## 1. Ce cer userii la Uptime Kuma (și ce înseamnă pentru noi)

| Cerere (votată) | Relevanță Linux Doctor |
|---|---|
| REST API pentru management monitoare (#2 ca voturi) | ❌ non-goal — noi nu administrăm monitoare; avem deja JSON schema + `--push` |
| Response-time breakdown pe faze (DNS/connect/TLS, #7407) | ✅ **oportunitate mică**: check-ul `network` măsoară deja DNS; extindem evidența cu *care fază* e lentă (pilonul „explică”) |
| On-call scheduling, escalation, incident timeline | ❌ non-goal — alt produs; Pro-ul nostru e delivery (email/fleet), nu incident management |
| Multi-location / distributed monitoring | ❌ infrastructură de fleet (Business, nu Free) |
| Status pages cu subscribe (email self-registration) | ❌ hosting (Business); Free acoperă `--md`/`--html` pentru share |
| PostgreSQL în loc de SQLite la scară | ❌ N/A (noi suntem snapshot CLI, fără daemon DB) |
| Maintenance windows cu auto-end via webhook | ⚠️ parțial acoperit: `--notify` doar-la-nou + timer = spiritul; un `--quiet-hours` pt. `--daemon` e candidat Pro mic |

## 2. Ce cer userii la Beszel (direct relevant — același spațiu „internal health”)

| Cerere | Relevanță Linux Doctor |
|---|---|
| Uptime/service monitoring gen Uptime Kuma (#463, super-cerut: „aș renunța la Kuma dacă Beszel ar avea ping/http”) | ✅ **validat a 3-a oară** check-ul `endpoint` (sănătate din exterior). Rămâne future/needs-design — e singurul gap mare pe care nici noi nu-l acoperim încă |
| Time-averaged thresholds (#93, anti-false-alarms la spike-uri) | ✅ **oportunitate nouă, ieftină**: detectare flapping din istoric (vezi §4.1) |
| Per-disk alert selection/exclusion (#1581, #405) | ✅ **deja acoperit** (toate partițiile reale + `dedupeKey` per device + `--ignore-code`) — unghi de messaging, nu de cod |
| Polling interval configurabil | ❌ N/A (noi suntem snapshot; `--daemon --interval` există deja Pro) |
| Database size monitoring (#1681) | ❌ nu e „problemă explicată”, e metrică — out of scope |
| Kubernetes pod monitoring | ❌ single-host doctor prin design |
| Time-range selection pe grafice (#405, #532) | ✅ **oportunitate mică GUI**: range 7d/30d/toate în History view |
| Confuzie „dismiss alert activ” (firul #93) | ✅ deja acoperit (`--ignore-code` exact + Undo în GUI) |

## 3. Ce NU construim (reafirmat)

REST API de management, on-call/incident, metrici k8s, status pages hosted, monitorizare DB, benchmark, inventar hw exhaustiv, monitorizare real-time. Poziția „doctor, nu monitor” rămâne — complementar cu Uptime Kuma + Beszel, nu concurent.

## 4. Candidați prioritizați (scope-guard pass ✅)

### 4.1 `stability/flapping` — notă derivată din istoric (Free, efort mic, **novel**)
Niciun competitor nu explică zgomotul de tip flap. Avem tot ce trebuie (`history.json` + diff NEW/FIXED): dacă un cod a flipat nou/fixed de ≥3 ori în fereastra de istoric, emitem info `stability/flapping` („X a apărut/dispărut de N ori în M rulări — prag fluctuant sau fault intermitent, nu degradare reală”). Pilonii „ține minte” + „explică”, zero probe noi, zero zgomot (info, fără penalizare scor).

### 4.2 Breakdown pe faze în `network` (Free, efort minim)
Când DNS e lent sau rezoluția pică, evidența spune deja timpul; adăugăm faza (DNS vs connect vs TLS) după pattern-ul cerut în Kuma #7407. Doar text în `detail`/`evidence`, fără coduri noi (sau un singur cod info dacă vrem pin).

### 4.3 Range selection în History view (Free GUI, efort mic)
7d / 30d / toate rulările — răspunde la Beszel #405/#532 fără arhitectură nouă (datele există în `history.json`).

### 4.4 `endpoint` — verificare din exterior (future, design necesar)
A treia validare independentă (Kuma o face, Beszel o cere, noi am marcat-o future). Rămâne future: trebuie decis *ce* sondăm fără config (servicii detectate? porturi listening?) ca să nu devenim Uptime Kuma.

### 4.5 `--quiet-hours` pentru `--daemon`/`--notify` (Pro, efort mic)
Ore liniștite (ex. noaptea) din config; completează filosofia anti-fatigue alături de `--heartbeat` și digest.

## 5. Concluzie

Piața validează direcția 0.5.0 existentă (certs/ports/fds/backup-stale + heartbeat + wizard) și adaugă exact **3 itemi mici, ieftini, pe misiune** (§4.1–4.3) + 1 Pro mic (§4.5). Nimic din research nu cere pivot sau feature mare nou — cel mai mare gap rămas (`endpoint`) e deja pe lista future.

## 6. Surse

1. https://github.com/louislam/uptime-kuma/issues/7078 (API, numeric monitoring, maintenance auto-end)
2. https://github.com/louislam/uptime-kuma/issues/7407 (response-time breakdown pe faze)
3. https://hyperping.com/blog/best-uptime-kuma-alternatives (top cereri: REST API, multi-location, on-call, SSO, status pages)
4. https://github.com/henrygd/beszel/issues/463 (uptime monitoring cerut masiv)
5. https://github.com/henrygd/beszel/issues/93 (time-averaged thresholds, dismiss confusion)
6. https://github.com/henrygd/beszel/issues/706 (polling interval)
7. https://github.com/henrygd/beszel/issues/1581 + #405 (per-disk alert selection, time ranges)
8. https://github.com/henrygd/beszel/issues/1681 + #818 (DB monitoring, k8s — non-goals confirmate)
9. https://selfhosting.sh/compare/uptime-kuma-vs-beszel/ + https://vmorecloud.com/uptime-kuma-vs-beszel/ + https://trendboxgeek.com/blog/beszel-vs-uptime-kuma/ (poziționare intern vs extern)
10. https://github.com/henrygd/beszel/pull/1513 (taburi pe system page — validează direcția noastră views)
