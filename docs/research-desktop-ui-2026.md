# Research: interfață de PC — cum arată desktopul real și cum îl aducem în Linux Doctor

> Data: 2026-09-08 · Intrare: [audit-ui-dashboard-0.5.0.md](audit-ui-dashboard-0.5.0.md). Ieșire: plan de implementare în 4 faze, compatibil cu filosofia repo-ului (no libs, calm layer, 5 views, vocabular pin-uit de teste). Surse la §7.

## 1. Ce înseamnă „interfață de PC" (convenții, nu gusturi)

Sase trăsături separă o interfață desktop de una de telefon — toate verificabile pe uneltele de referință din domeniu:

1. **Fluiditate pe fereastră** — layout-ul se întinde pe canvas, nu se centreze într-o coloană cu cap. Pe 1920, Cockpit/Beszel/Grafana folosesc tot ecranul.
2. **Multi-pane / master-detail** — lista trăiește lângă detaliu; selecția schimbă panoul, nu derulează pagina. (Mail clients, IDE-uri, Mission Center, lista de servicii din Cockpit.)
3. **Densitate** — rânduri de 24–32px, tipografie mică pentru date (12–13px), numere tabulare aliniate; hero-uri mici sau inexistente. Detaliul bogat e la cerere (panou), nu implicit pe fiecare card.
4. **Chrome persistent** — toolbar și/sau status bar mereu vizibile: filtrare, stare, context, fără scroll ca să afli „ultima verificare".
5. **Tabele, nu acordeoane** — listele scannabile cu ochii pe coloane (severitate, titlu, cod, oră, acțiuni); expandarea e panoul din dreapta, nu un derivat în flux.
6. **Tastatură + URL-state** — shortcut-uri peste tot (le avem) și stare reflecată în URL pentru deep-link/share (nu o avem).

## 2. Cum o fac cele 3 referințe din monitoring

| Referință | Pattern cheie | Ce luăm |
|---|---|---|
| **Cockpit** (PatternFly) | Masthead + nav verticală afișată implicit pe desktop (toggle la nevoie); pagini ca benzi de secțiuni; liste/tabele dense cu acțiuni la capăt de rând | rail-ul există deja la noi; luăm „secțiuni în bandă pe lățime completă" și densitatea tabelelor |
| **Beszel** | Dashboard = grid responsiv de carduri + **pagină de detaliu separată** per sistem; „renders fine on a phone" — desktopul e canvas-ul principal, mobilul e fallback | pattern-ul listă→detaliu; grija lor de fallback mobil e deja natura noastră (≤1099 neschimbat) |
| **Grafana / Mission Center** | panouri în grid 12 col; coloane redimensionabile; totul tabel, zero acordeon | gridul 12 col pentru Overview la lățime; tabelele dense |

Lecție comună: **mobilul e degrade-ul, nu ținta.** Toate 3 projetează pentru 1440+ și degradează gracios sub 1100 — exact inversul nostru (1100 e tavanul).

## 3. Propunere: 4 faze, fiecare utilă independent

### Faza 1 — Shell fluid (doar CSS, risc minim) — *fundamentul*
- Păstrăm tot ≤1439px **identic**. Adăugăm `@media (min-width: 1440px)`:
  - `.wrap` decapat (100% lățime, padding lateral 24–32px); `.layout` devine `230px minmax(0,1fr)`;
  - `.content`/`#report` fără cap, grid 12 col la nevoie; componentele cu cap 1040 capătă `max-width: none` în acest media query și se întind pe coloane definite;
  - padding body 32→20; hero compact: numeral 64→40px, gauge ~72px, tiles rămân.
- **Efort:** ~60–80 linii CSS într-un singur fișier nou `wide.css` (ordinea build-ului: după responsive.css). Zero JS, zero HTML. Goldens/README neatinse la <1440.

### Faza 2 — Master-detail pe Overview (JS + CSS) — *schimbarea de comportament*
- La ≥1440: findings = **tabel dens în stânga** (rând 30px: dot severitate, titlu, cod, badge NEW) + **panou de detaliu persistent în dreapta** (span 5/12 cols): START HERE, evidence, why-it-matters, fix, butoane.
- START HERE **nu dispare** — devine panoul implicit (selecția = primul finding high). Dispariția duplicației (același finding în card MARE + în listă) e un bonus de densitate.
- Click/Enter pe rând → panoul; `j/k` navighează (există deja arrow-roving — extindem). La <1440: fallback exact la layoutul actual (card START HERE + acordeoane) — **mobilul nu se atinge**.
- **Efort:** ~150 linii JS (renderer separabil în ui-views) + ~120 CSS. Cel mai riscant punct: `dashboard-state.test.js` pinuie structura — testele rulează la viewport de vm; ne asigurăm că fallback-ul mobil rămâne DOM-ul pin-uit.

### Faza 3 — Densificarea secțiunilor (tabele la lățime)
- La ≥1440, secțiunile (High/Medium/Info/Fixed/Skipped/Changes) devin tabele dense cu coloane fixe; expanded-in-place rămâne pentru mobil.
- `content-visibility: auto` pe rânduri (49 checks în matricea Checks) — render mai ieftin.
- **Efort:** ~100 linii CSS + mici adăugiri de clase în renderers; vocabularul (titluri, codes, badges) neschimbat → output-parity intact.

### Faza 4 — Chrome + URL-state (finisaj desktop)
- **Status bar** jos: ultima verificare + timer next-run (din `/api/schedule`) + versiune + shortcut-uri (footer-ul actual urcă aici, sticky).
- **URL sync:** `?view=checks&sev=high&q=code:diskf` — refresh/restaurare/deep-link; `replaceState` pe fiecare schimbare (fără istoric spam). localStorage rămâne fallback.
- `text-wrap: balance` pe titluri de carduri; sweep `tabular-nums` pe coloanele de numere; `color-scheme`/`theme-color` urmăresc tema activă.
- **Efort:** ~80 linii JS + CSS.

## 4. Contrains din repo (toate respectate)

- **„five views, no more"** (docs/dashboard.md) — neschimbat: rearranjăm layout în interiorul celor 5 views.
- **No libraries, calm layer** — doar CSS/JS vanilla; fără animații noi; paleta/variabilele existente.
- **Output-parity** — niciun titlu/mesaj schimbat; doar geometrie.
- **Teste** — `dashboard-state.test.js` (vm peste bundle) rulează la fallback-ul <1440: pin-urile rămân valabile; adăugăm 1–2 teste pentru wide-layout (clasă `.wide` pe `html` la matchMedia) și pentru URL-sync.
- **README money shot** — screenshot.mjs trage la 1280×1250 (<1440): imaginea oficială rămâne identică; opțional adăugăm a 3-a captură la 1920 după Faza 1–2.
- **Terminal theme** — variabile-only: layoutul nou folosește doar variabile existente, deci cele 4 teme rămân consistente gratuit.

## 5. Ce NU facem (deliberat)

- Fără coloane redimensionabile drag (complexitate JS disproporționată) — raport fix 7/5 la ≥1440.
- Fără virtualization library (liste ≤ 50); doar `content-visibility`.
- Fără multi-window/multi-host — rămâne single-machine (poziționarea „doctor, nu monitor").
- Nu atingem breakpoint-urile ≤1099 (mobilul e deja bun — before-390.png).

## 6. Ordinea recomandată

Faza 1 (CSS-only, vizibil imediat pe laptop) → Faza 3 (densitate, tot CSS) → Faza 2 (master-detail, JS) → Faza 4 (URL-state + status bar). Fiecare fază = un commit separat, testat; suitele 544+ trebuie să rămână verzi după fiecare.

## 7. Surse

1. PatternFly — Masthead / Sidebar / Dashboard Layout guidelines (sistemul de design al Cockpit): https://www.patternfly.org/components/masthead/design-guidelines/ · https://www.patternfly.org/components/sidebar/design-guidelines/ · https://pf3.patternfly.org/v3/pattern-library/dashboard/dashboard-layout/
2. Cockpit — screenshots (network/dashboard): https://cockpit-project.org/ + https://github.com/cockpit-project/cockpit
3. Beszel — „dashboard and system page, side by side" (listă grid + detaliu): https://github.com/henrygd/beszel · widget grid Homarr: https://homarr.dev/docs/widgets/beszel-system-grid/ · sumguy.com/beszel-lightweight-monitoring („renders fine on a phone")
4. Vercel Web Interface Guidelines (ruleset fetch 2026-09-08): https://github.com/vercel-labs/web-interface-guidelines
5. Evidență locală: `docs/screenshots/audit-2026/before-{390,1440,1440-full,1920}.png` + enumerarea max-width/@media din `src-gui/css/*.css`.
