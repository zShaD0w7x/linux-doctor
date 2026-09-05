# Research: competiția (Uptime Kuma, Beszel, Cockpit, Netdata, Pulse)

> Data: 2026-09-04 · Surse la §6. Completează matricea din `research-user-needs.md` §3 (care n-avea Kuma/Beszel).

## 1. Harta pieței — 3 întrebări, 3 joburi

| Întrebarea | Cine răspunde | Ce lipsește la ei |
|---|---|---|
| „E sus?” (is it up?) | **Uptime Kuma** (90k⭐) — HTTP/TCP/DNS/ping/SSL din exterior | habar n-are *de ce* pică ceva (zero vizibilitate resurse/procese) |
| „Cum performează?” (how?) | **Beszel** (20k⭐), **Netdata**, Prometheus | știu grafice, nu știu *cauza*; Kuma+Besszel împreună = 2 dashboard-uri de citit |
| „De ce e stricat și cum repar?” (why + fix?) | **nimeni** — ăsta e golul | — |

Mantra comunității, repetată identic pe 4+ surse: *„Uptime Kuma tells you your server is down, Beszel tells you why”* — doar că Beszel de fapt **nu** spune de ce, arată doar graficele din care ghicești tu. Lanțul real e: Kuma (simptom) → Beszel (context) → **omul ghicește cauza**. Linux Doctor intră exact pe veriga lipsă: cauză + fix.

## 2. Fișe competitori (scară, model, puncte slabe exploatabile)

**Uptime Kuma** — 90k⭐, MIT, 790 issue-uri deschise, donații ~$4.3k sold. Puncte slabe: fără REST API (#2 cea mai votată cerere!), monitorizare dintr-o singură locație, fără on-call/escalation, SQLite la scară, listă negestionabilă peste 40–50 monitoare, 90+ canale de notificare = complexitate. Maintainer cu burnout declarat („no capacity to review for months”).

**Beszel** — 20k⭐, MIT, Go hub + agent 10MB, SQLite/PocketBase. Puncte slabe: **fără uptime/service checks** (userii cerșesc ping/http — „aș renunța la Kuma dacă…”), **alerte fără cooldown** (spam la CPU oscilant — recunoscut oficial), polling blocat, fără per-disk alert config, fără time-range selection, fără Prometheus export, Docker-centric.

**Cockpit** — LGPL, Red Hat. Puncte slabe: single-server (multi-host Dashboard **deprecated** — fleet view cere Grafana+PCP deasupra), Podman-centric, istoricul cere plugin PCP (neactivat default). Administrează, nu diagnostichează.

**Netdata** — 200–500MB RAM,入金 Cloud parțial plătit, „pricing rage” documentat ($4.50/lună per computer). Complexitate care alungă exact publicul nostru.

**Pulse** (intrat nou) — Proxmox-native, „Patrol scan” orar de *silent errors*, asistent LLM pe infrastructură, monitorizare backup tasks. Validează independent două teze ale noastre: patrol-ul de erori tăcute (= `backup/stale`, checks read-only) și AI-ul ca explicator (planul nostru AI plans Pro).

## 3. Poziționare (de folosit în README/marketing)

> *Uptime Kuma îți spune că serverul e jos. Beszel îți arată graficele. **Linux Doctor îți spune de ce și ce să rulezi ca să repari.***

Nu concurăm cu niciunul — suntem stratul lipsă dintre simptom și rezolvare. Complementar cu ambele, nu înlocuitor (exact cum își poziționează și ei relația unul-altuia).

## 4. De furat (concret, mic, pe misiune)

1. **Cooldown anti-flap la alerte** — rana deschisă a lui Beszel (spam recunoscut oficial). Noi o avem structural (notify-only-on-new + diff NEW/FIXED): de *comunicat* agresiv, nu de construit.
2. **Per-disk alert config** — cerut la Beszel (#1581); noi avem deja toate partițiile + `dedupeKey` + `--ignore-code`: unghi de messaging + eventual UI de excludere în thresholds panel.
3. **Status pages / subscribe** — doar Kuma le are; la noi intră pe rampa Business (hosted), nu în Free.
4. **Live logs lângă findings** (Beszel arată logs live pe pagina de sistem) — findings-urile noastre au deja evidence din journal; un „tail live” per finding ar fi extensie naturală, nu paradigmă nouă.
5. **Onboarding de 5 minute** — standardul Beszel/Kuma („single curl, sensible defaults”). `--init` wizard-ul nostru răspunde exact aici; de testat că e real 5 minute.

## 5. Explicit de NU vânat

REST API de management monitoare, on-call/escalation, multi-location polling, K8s pod metrics, DB size monitoring, metrici real-time per secundă, query language (PromQL), custom dashboards construite de user, mobile app nativ. Toate sunt fie alt produs, fie exact complexitatea de care fug userii spre noi.

## 6. Semnale de monetizare

- Uptime Kuma trăiește din donații (~$136/lună buget) — modelul donații nu scalează; banii sunt în hosted ($3/lună/instanță pe InstaPods, model copiat de toți).
- Netdata per-computer pricing = rage + churn („enshittification” threads) — validează prețul nostru flat per-user, nu per-mașină.
- Pulse pune AI-assistant + patrol în spatele paywall-ului — precedent direct pentru AI plans Pro.
- Concluzie: Free distribuie (viral + retenție) → Pro livrează individual → Business administrează flote. Neschimbat față de board.

## 7. Surse

1. https://selfhosting.sh/compare/uptime-kuma-vs-beszel/ (feature matrix complet, cifre RAM)
2. https://vmorecloud.com/uptime-kuma-vs-beszel/ (vantage points, blind spots, secvența memory-leak → outage)
3. https://trendboxgeek.com/blog/beszel-vs-uptime-kuma/ (alert spam Beszel fără cooldown)
4. https://devtoolbox.blog/beszel-vs-uptime-kuma-homelab-monitoring/ (90+ canale Kuma vs minimalism Beszel)
5. https://selfhostlab.io/self-hosted-monitoring-netdata-vs-prometheus-grafana-vs-uptime-kuma/ (cele 3 întrebări, costuri stack)
6. https://hyperping.com/blog/best-uptime-kuma-alternatives (top cereri: REST API, multi-location, on-call, SSO)
7. https://github.com/louislam/uptime-kuma (90k⭐, 790 issues, donor model)
8. https://opencollective.com/uptime-kuma ($4.3k sold, ~$136/lună)
9. https://instapods.com/apps/beszel/vs/cockpit/ (Cockpit single-server, dashboard deprecated)
10. https://www.xda-developers.com/i-replaced-uptime-kuma-with-this-powerful-tool/ (Pulse: patrol silent errors, LLM assistant)
11. https://github.com/henrygd/beszel/issues/463,093,706,1581,1681,818 (uptime, thresholds, polling, disks, DB, k8s)
12. https://github.com/louislam/uptime-kuma/issues/7078,7407,6799,6944,5665 (API, response breakdown, maintenance)
13. https://github.com/cockpit-project/cockpit/issues/12784,21871 + PR #21670, #13186, #17901 (nav, fullscreen, cards, customizare)
14. https://selfhosting.sh/compare/beszel-vs-netdata/ (200–500MB Netdata vs 10MB agent)
