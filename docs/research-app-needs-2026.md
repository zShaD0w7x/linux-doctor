# Research: ce ne trebuie în aplicația desktop (Tauri) — prioritizat

> Data: 2026-09-09 · Întrebarea: *„ce ne trebuie în app?"* — ce transformă shell-ul actual dintr-o fereastră peste dashboard într-un produs desktop complet. Stadiu la data analizei: shell minimal (doar `core:default`, zero plugin-uri), UI la nivel (master-detail, 5 views, teme), window 1500×950. Surse la §6.

## 1. Diagnoza într-o frază

**Aplicația nu are încă un motiv să existe în afară de „nice GUI".** Afișează exact același dashboard ca `--web`, dar cere Node ≥20 pe PATH, nu pornește cu sistemul, nu are iconiță în tray, nu se actualizează singură. Toate cele 4 probleme sunt known și au soluții ieftine în ecosistemul Tauri 2.

## 2. P0 — existențial (fără asta, app-ul e frântă pentru mulți)

| # | Ce | De ce | Cum | Efort |
|---|---|---|---|---|
| 1 | **Bundle Node runtime** în .deb/.AppImage | Codul rezolvă deja `<resources>/runtime/node` (lib.rs, ordinea: env → resources → PATH); RELEASING.md îl numește „planned follow-up". Până atunci, userul fără Node primește app moartă — fricțiune fatală la primul runtime | Descărcăm tarball-ul oficial Node 20 per țintă în job-ul GUI din release.yml și îl punem în resources (convenția Tauri sidecar/`externalBin` suportă asta first-class). Fără schimbări de cod — doar packaging | **S–M** (CI + ~15MB per pachet) |
| 2 | **Auto-update** (Tauri updater) | Fiecare fix (ex. batch-ul de UI de azi) nu ajunge niciodată la utilizatorii instalați; deja am 3 versiuni într-o săptămână | Plugin-ul oficial `tauri-plugin-updater`: chei de semnare minisign + `latest.json` generat în release.yml pe GitHub Releases (fluxul de signed tags există deja) | **M** (endpoint + chei + UI de consimțământ) |

*Pre-condiție transversală:* P0-urile de securitate din audit (`</script>` în `--html`, ReDoS scrub, esc()) aterizează identic în app — bundle-ul e același. Se fac oricum, dar înainte de a promova app-ul.

## 3. P1 — motivul să deschizi app-ul, nu `--web`

| # | Ce | De ce | Cum | Efort |
|---|---|---|---|---|
| 3 | **Tray icon + meniu** (core în Tauri 2) | Prezența de fundal = rostul unui doctor: dot verde/galben/roșu cu scorul, „Run now", „Open dashboard", „Quit". Fără tray, app-ul e un tab în plus | API core tray-icon + tooltip cu scorul din `/report` existent | **S–M** |
| 4 | **Autostart** (plugin oficial `tauri-plugin-autostart`) | Mașina „vorbește doar când apare ceva nou" — promisiunea produsului. CLI-ul are `--install-timer`; app-ul poate piggyback pe același timer systemd sau pe autostart propriu (acoperă și non-systemd) | Toggle în Settings; la login pornește ascuns + daemon mode + notify | **S** |
| 5 | **Single-instance** (plugin oficial) | Al doilea click pe iconiță deschide fereastra existentă, nu un duplicat cu al doilea server 17321 (care cade pe port alternativ) | `tauri-plugin-single-instance` — ~10 linii | **XS** |
| 6 | **Notificări native** (plugin) | În app, `notify-send` prin shell devine inutil — API-ul OS direct, cu butoane de acțiune („Vezi", „Ignoră") | `tauri-plugin-notification`; fallback CLI rămâne | **S** |

## 4. P2 — onboard & setări (când e publicată)

7. **Onboarding in-app** (paritate cu `--init`): 3 pași cu butoane (config starter → timer → test notificare). Non-TTY friendly by definition.
8. **Settings reale**: thresholds panel există deja în dashboard (API `POST /thresholds` pe 17321 există); lipsește UI pentru timer install/uninstall și gestionarea ignorărilor (API `/api/ignore` există).
9. **About & licență**: starea Pro + activare cheie — fundația pentru monetizare (strategia: Pro = individual, app = vehiculul de distribuție).

## 5. Deliberat NU (coerent cu poziționarea „doctor, nu monitor")

- Fleet/multi-host în app (Business e hosted, nu desktop)
- Grafice live în timp real (job-ul lui Beszel/Netdata)
- Auto-start scanare agresivă la login fără consimțământ (trust-ul e produsul)
- Migrarea checks-urilor în Rust (pierdem zero-dep Node + întregul ecosistem de teste pentru un câștig imaginar)

## 6. Surse

1. Tauri — macOS bundle / sidecar / tray: https://v2.tauri.app/distribute/macos-application-bundle/
2. Sidecar first-class (`bundle > externalBin`, convenția `-TARGET_TRIPLE`): https://chatml.com/blog/desktop-ai-app-tauri-2-instead-of-electron + https://gist.github.com/eonist/b686cc7e4b4534dd58be0bf3d6c31ed6
3. Pattern Node-as-sidecar (fără Node pe PATH la user): https://playbooks.com/skills/dchuk/claude-code-tauri-skills/tauri-nodejs-sidecar
4. Plugin-uri oficiale v2 (autostart, notification, updater, single-instance): https://v2.tauri.org.cn/reference/javascript/autostart/ (mirror oficial; doc-urile principale v2.tauri.app)
5. Intern: `src-tauri/src/lib.rs` (ordinea rezolvării Node: `LINUX_DOCTOR_NODE` → `<resources>/runtime/node` → PATH), `docs/RELEASING.md` §Node runtime resolution, `docs/research-feature-gaps-2026.md` (idei CLI-side care aterizează și în app).

## 7. Ordinea recomandată

**1 → 2** (P0, release-uri următoare) → **5** (XS, oriunde) → **3 → 4 → 6** (P1, un release cu tema „app devine app") → P2 când publicăm. Fiecare element e independent și independently shippable.
