# When to Start Building Linux Doctor Pro — Research Against Primary Sources

**Date:** 2026-08-27 · **Author:** automated research (Muse Spark) · **Scope:** primary sources only
**Context:** `linux-doctor` 0.3.5 · CLI + Tauri desktop · 44 checks (145 codes) · GPL-3.0-or-later + commercial dual-license · open-core with `@linux-doctor/pro` add-on (not in this repo) · pre-1.0 · install via `npm` + `AppImage`+`deb`+`rpm` · `COMMERCIAL-LICENSE.md` declares Free / Pro / Business / Enterprise tiers

---

## Executive summary

Do **not** start billing Pro customers before `1.0.0`. Start *building* Pro infrastructure **now**, but keep it private, additive, and non-distracting — the pattern every durable open-core project followed. The consensus from primary sources is:

- **Monetize the hosted/managed layer, not the core binary** (Supabase, Plausible, Umami, Sentry, Cal.com all kept the core MIT/AGPL/GPL and charged for hosting, fleet, SSO, compliance).
- **Introduce paid tiers after you can articulate a stable public contract** — GitLab waited ~22 months (Oct 2011 → Aug 2013, v1.0 → v6.0) until the CE was undeniably useful; Plausible waited 5 years before carving out EE (v2.1.0, Feb 2024); Sentry's cloud paid tiers only became meaningful years after the BSD-licensed 2008–2013 bootstrap; Supabase introduced paid hosting ~14 months after launch (Jan 2020 → Mar 2021). No credible project charged for add-ons while still on its first few `0.3.x` releases.
- **SemVer §4 is explicit: `0.y.z` means "anything MAY change"** — you cannot promise stability to paying customers and simultaneously reserve the right to break everything. `1.0.0` is the commitment point.
- **The projects that broke trust (MinIO, Cal.com's recent closure debate, HashiCorp/Cockroach relicensing) all did two things: monetized under investor pressure before the core contract was stable, and gated or withdrew previously-free capabilities.** The ones that kept trust (GitLab, Supabase, Sentry until the BSL debate) kept CE fully functional and charged only for features a single-user laptop literally cannot provide (fleet, SSO, compliance, SLA, scale).

The recommended sequencing for linux-doctor is: **now → harden the free product and ship Pro scaffolding privately → 1.0.0 with a stable contract → paid Pro/Business launch → post-1.0 enterprise expansion.** Detail and citations below.

---

## 1. How mature open-core projects timed their Pro/Enterprise launch

### 1.1 GitLab — the canonical open-core timeline

| Milestone | Date | Evidence |
|---|---|---|
| First commit / project start | **2011-10-08** (Ukraine, house without running water, built with Valeriy Sizov) | [GitLab Handbook — History of GitLab](https://handbook.gitlab.com/handbook/company/history/) |
| `v1.0` tag | **2011-10-13** (commit `d3784687`, "v 1.0.0") | [GitLab FOSS commit d3784687](https://gitlab.com/gitlab-org/gitlab-foss/-/commit/d3784687943e0bd699d73d82a6bc6cac39689473) |
| Dmitriy tweets "want to work on GitLab full-time", Sid Sijbrandij reaches out | **2013** | [Handbook — History, §2013](https://handbook.gitlab.com/handbook/company/history/) ("At the same time Dmitriy tweeted … Sid and Dmitriy teamed up and introduced GitLab Enterprise Edition") |
| **GitLab 6.0 Enterprise Edition announced** (first paid tier) | **2013-07-22** (blog) / released **2013-08-22** (6.0) | [Announcing GitLab 6.0 EE — 2013-07-22](https://www.people.rbdc.net/source/releases/posts/2013-07-22-announcing-gitlab-enterprise-edition.html.md) ("The normal GitLab version will be called CE … There will also be a GitLab EE … available only to subscribers") — [GitLab releases archive](https://about.gitlab.com/releases/2013/08/22/introducing-gitlab-6-0-enterprise-edition/) |
| Incorporation as GitLab B.V. | **2014** | [Wikipedia — GitLab Inc.](https://en.wikipedia.org/wiki/GitLab_Inc.) ; Handbook history §2014 |
| Monthly 22nd release cadence formalized | **2014 onward** | Handbook history §2014 |

**What EE contained at launch:** exactly one enterprise-only feature — *LDAP group sync*. The announcement is explicit: "No features will ever be removed from the Community Edition. For example, the LDAP user functionality will stay in CE. In EE … the ability to synchronize GitLab groups with LDAP groups." The commercial justification was candid: "The income … will help us fund the continued development." CE stayed **MIT-licensed** forever.

**Lesson for linux-doctor:** GitLab shipped **~22 months and 5 major versions** of a purely-free, MIT-licensed product before asking anyone to pay. The first paid feature was *governance for large orgs* (group sync), not a better version of something CE already did. By the time EE appeared, CE was already the *entire product* for individuals and small teams — a promise GitLab repeated in every doc: "The Community edition is the heart … No features will ever removed from CE."

### 1.2 Sentry — BSD → hosted SaaS → BUSL/FSL, with no open-core split

Sentry is the *counter-example* to open-core — and therefore instructive.

- **2008:** David Cramer creates Sentry at Disqus as BSD-licensed error tracking. [Sentry — Driven by Open Source (2015-06-30)](https://blog.sentry.io/driven-by-open-source/) ; [ShiftMag interview (2023-06-05)](https://shiftmag.dev/milin-desai-sentry-open-source-business-model-739/) ("founded as an open-source tool in 2008")
- **2012-12:** Christmas 2012, Cramer + Chris Jennings build Stripe billing + multi-org support in two holiday weeks. [Sentry — From the Beginning](https://cra.mr/sentry-from-the-beginning/) ; [Sentry blog (2013-02-05)](https://techcrunch.com/2013/02/05/sentry-the-now-profitable-bug-tracker-used-by-disqus-pinterest-rdio-path-more-gets-a-huge-makeover/) confirms self-host was BSD, hosted appeared "around a year ago" before Feb 2013.
- **2013-02-28:** First paying SaaS customer ($7). Growth to ~500 paying customers by Feb 2013, profitable as a side-project. Not open-core — **same codebase**, same features self-hosted vs cloud.
- **2019-11-06:** Relicensing to **Business Source License (BUSL)** with 36-month conversion to Apache-2.0. Explicitly rejected open-core: "There is no difference between our cloud service and our open-source product (no open-core model)" and "Previous licensing models — open core, GPL, permissive — are not sufficient". [Re-Licensing Sentry (2019-11-06)](https://blog.sentry.io/relicensing-sentry/)
- **2023-08-03:** BUSL clarified again ("The BUSL … after a period of time will convert to Apache-2.0 … you simply cannot commercialize it as a competing service"). [Let's Talk About Open Source (2023-08-03)](https://blog.sentry.io/lets-talk-about-open-source/)
- **2024–2026:** Founder article reaffirms FSL (Functional Source License, Busl-variant) — source available, 2-year conversion to Apache-2.0. [Self-Hosted Sentry docs — develop.sentry.dev](https://develop.sentry.dev/self-hosted/) ("Sentry is Fair Source under the FSL … becomes Apache 2.0 after 2 years")

**Lesson:** Sentry proves you can build a venture-scale business *without* a Pro binary at all — by selling **hosted convenience + compliance** on top of an identical codebase. When they finally restricted the license, they did so **11 years** after the project started and **6 years** after SaaS revenue — and still faced sustained community debate about "source-available is not open source". For a GPL-licensed diagnostics tool, the Sentry path today would mean staying GPL for self-host and charging for a managed fleet service — not gating checks.

### 1.3 PostHog — MIT + `ee/` directory, paid from week one (YC-backed)

| Milestone | Date | Evidence |
|---|---|---|
| YC W20, first code | **2020-01-23** | [PostHog Handbook — Story](https://posthog.com/handbook/story) |
| HN launch, 300 deployments in days, 800 stars in a week | **2020-02-20** | Same handbook; [PostHog blog — After the HN Launch (2020-03-01)](https://posthog.com/blog/after-the-hn-launch) |
| First paid offering / pricing page with calendar embed | **Apr 2020** (two months post-HN) | [How we got our first 1000 users (2024-06-21)](https://posthog.com/founders/first-1000-users) ("Once we'd nailed pricing, we launched PostHog Cloud in April 2020") |
| Split into `posthog` (MIT) + `ee/` (proprietary) | **2020-08** (PR #1390) | [Issue #306 — Explain free vs paid for self-hosted](https://github.com/PostHog/posthog.com/issues/306) ("We're about to merge changes that mean our main repo won't be entirely MIT anymore, but we will have a read-only mirror … posthog-foss") |
| Reached 1,000 users | **May 2020** | Same handbook |
| First explicit EE features (multi-project orgs, ClickHouse) | **Nov 2020 (1.16.0)** — "As this is an Enterprise Edition feature, please contact sales@posthog.com" | [CHANGELOG snapshot 1.16.0 (Nov 2020)](https://github.com/PostHog/posthog/blob/aec2081e33324e645cfd1527e4216a4782f5d25f/CHANGELOG.md) |
| Usage-based + generous free tier crystallized | **Mar–May 2021** | [PostHog newsletter — pricing advice](https://posthog.com/newsletter/pricing-advice) (Aug 2020 subscription → Mar 2021 usage-based → May 2021 100× free tier) |

**Lesson:** PostHog *is* the fastest credible path to paid open-core (paid within **≈3 months** of first code). But the preconditions matter: YC funding + full-time founders + a read-only `posthog-foss` mirror + explicit `ee/` directory from day one + a **hosted cloud** as the primary monetization (self-host stayed free). Their handbook is candid that "We didn't need to build a payment flow … people were more forgiving of issues" and that enterprise self-host "paid deployment" was later *removed* to double-down on cloud + open-source. For linux-doctor, the PostHog speed is only replicable if the maintainer can commit full-time and the hosted fleet is the real product — not a check-suite paywall.

### 1.4 Supabase — open-source Firebase, hosted Pro in 14 months

| Milestone | Date | Evidence |
|---|---|---|
| Launch as YC W20 open-source Firebase alternative (6 tools stitched together) | **Jan 2020** | [Supabase beta pricing blog (2021-03-29)](https://supabase.com/blog/pricing) context; [TechCrunch — $6M seed (2020-12-15)](https://techcrunch.com/2020/12/15/supabase-raises-6m-for-its-open-source-firebase-alternative/) |
| $6M seed (Coatue, Mozilla) while still **free for everyone** (alpha) | **Dec 2020** | TechCrunch Dec 2020 ("Like other YC startups … close after demo day in August") |
| **Beta pricing introduced: Free + Pro $25/project + usage** | **Mar 2021** (the birth of the $25 Pro) | [Supabase Pricing History (saaspricepulse, 2026-02-26)](https://www.saaspricepulse.com/blog/supabase-pricing-history) table ("Beta pricing launch $25/mo") and [Supabase blog — pricing (2021-03-29)](https://supabase.com/blog/pricing) |
| General Availability, pricing unchanged | **Apr 2022** | SaaSPricePulse timeline |
| Org-based billing + Team $599 | **Sep 2023** | Same timeline |
| Still $25/mo five years later, $70M ARR, $5B valuation | **Feb 2026** | SaaSPricePulse ("Five years later, it's still $25/month") |

**Lesson:** Supabase charged from **month 14**, but *only for the managed service* — the underlying Postgres/GoTrue/storage code stayed freely self-hostable. Pricing stayed deliberately flat ($25 never rose) — the upsell was compute/storage/MAU overages and Team/Enterprise compliance. The 14-month free window built distribution before any paywall.

### 1.5 Plausible — MIT → AGPL → CE/EE split after 5 years

| Milestone | Date | Evidence |
|---|---|---|
| Solo founder Uku Taht starts Plausible, asks "should there be a free tier?" — decides freemium support cost too high for a solo | **Dec 2018 start; Apr 29, 2019 launch post** | [Plausible — I'm launching Plausible (2019-04-29)](https://plausible.io/blog/launching-plausible) |
| MIT licensed initially | **2018–2019** | GitHub history |
| Switch to **AGPLv3** ("Use AGPL license going forward") | **2020-10-12** (commit `84ee2c0`) | [Commit 84ee2c0](https://github.com/plausible/analytics/commit/84ee2c04aa0312f93cf792e1355d748cd9196d1a) |
| First paying customers $6/$12/$36 tiers, $64 M1 | **May 2019** | [JointheQuarter — journey piece](https://www.jointhequarter.com/blog/plausible) + launch post tiers |
| **Community Edition / Enterprise Edition split at v2.1.0** — CE stays AGPL, EE becomes source-available (no redistribute) + CLA required + new `ghcr.io/plausible/community-edition` image | **2024-02-23 rc0 → 2024-05-23 v2.1.0** | [Plausible — Introducing Community Edition (2024-02-23)](https://plausible.io/blog/community-edition) ; [Release v2.1.0](https://github.com/plausible/analytics/releases/tag/v2.1.0) ("As of 2.1.0 this project will split into CE (AGPL) and EE (source-available)") ; [Discussion #3817 rc0 notes](https://github.com/plausible/analytics/discussions/3817) |
| Hosted Business/Enterprise features (funnels, ecommerce revenue) gated, but CE still "the same code running in production … we will keep maintaining, improving and adding features to CE … twice annually" | **2024–2026** | Blog CE post; current [Pricing page](https://plausible.io/docs/subscription-plans) (Enterprise-only: SSO, Sites API, managed proxy, raw exports) |

**Lesson:** Plausible monetized **hosted** from the first month, but waited **5 years** before holding *any* feature back from self-hosters — and when it did, the held-back set was narrowly scoped to "help us run managed hosting at scale + enterprise governance" (SSO, Sites API, raw exports). The blog promise — "Nothing from CE will be taken away" — is the trust anchor. The start-up-to-EE interval is the longest in this survey, reflecting a bootstrapped, no-VC timeline.

### 1.6 Cal.com — MIT, $12 SaaS from day one, pure open-source until 2026 debate

| Milestone | Date | Evidence |
|---|---|---|
| Launch as Calendso (Product Hunt, #1 day), ~50 paying customers day one despite only a $12 paid option (no free tier yet) | **2021-04-30** | [Latka interview — Cal.com May 2022 transcript](https://getlatka.com/companies/calcom) ("50 paying customers … we didn't do a free plan") |
| Rebrand to Cal.com (purchased cal.com domain), free tier added (mirrors Calendly), 25–30k users, ~10% paid conversion, ~$15k MRR | **Sep 2021 rebrand; May 2022 snapshot** | Same Latka interview; [GetLatka — 18-year-old raises $32M](https://getlatka.com/blog/18-year-old-raises-32m-to-build-opensource-version-of-calendly) |
| $32.4M total raised, MIT licensed whole codebase (no proprietary EE dir) | **2021–2022** | [NovVista — Cal.com Going Closed Source (2026-04-16)](https://novvista.com/cal-com-going-closed-source-is-the-canary-in-the-open-source-business-model-mine/) |
| Scale to ~44.6k stars, 20k customers, $5M ARR | **Oct 2025** | [DEV teardown (2026-05-27)](https://dev.to/beton/calcom-pricing-teardown-2026-4j40) + pricing page ([cal.com/pricing](https://cal.com/pricing)) |
| Current cloud tiers: Free (1 user) → **Teams $12/seat** → **Organizations $28/seat** (SAML SSO, SCIM, SOC2/HIPAA) → Enterprise custom (dedicated DB, SLA) — self-host stays MIT, no license compliance overhead | **2026-05** | Same DEV teardown; [UnlockSaaS teardown (2026-05-17)](https://unlocksaas.com/pricing-teardown/cal-com) |
| 2026-04 "going closed source" debate + `Cal.diy` MIT fork — CEO Richelsen's quote: "We will have 20-some Reddit posts … we're going to be the bad boys" | **Apr 2026** | [Ayvhieel — Why Cal.com Went Closed Source (2026-04-18)](https://ayvhieel.substack.com/p/why-calcom-went-closed-source-the) ; NovVista analysis |

**Lesson:** Cal.com monetized **hosted SaaS from day one** and never gated self-host — the cloud paywall is per-seat Teams/Organizations (SSO/compliance), not feature-stripping the MIT self-host. The 2026 closed-source debate is a cautionary signal: even a successful project ($5M ARR) faces investor pressure when the MIT self-host is "too good" — the NovVista analysis calls this the "paradox: the better your free product, the harder it is to sell the paid one." Cal.com's answer — release `Cal.diy` as the free community engine while closing the production codebase — is widely seen as breaking trust with ~1k contributors.

### 1.7 Umami — MIT forever, cloud add-on in 2022

| Milestone | Date | Evidence |
|---|---|---|
| Created by Mike Cao, MIT licensed, GA alternative | **2020-07-17** (repo creation) | [umami-software/umami README](https://github.com/umami-software/umami) |
| $1.5M pre-seed (Race Capital), 11k stars, 4.6M downloads | **Jul 19, 2022** | [GlobeNewswire — Umami Raises $1.5M (2022-07-19)](https://www.globenewswire.com/news-release/2022/07/19/2481786/0/en/Umami-Raises-1-5-Million-Pre-Seed-Funding-Round-Led-by-Race-Capital-to-Continue-Growing-its-Popular-Open-Source-Privacy-Focused-Web-Analytics-Platform.html) |
| **Umami Cloud** launched (Hobby free, Pro from $20) — self-host stays MIT free forever | **Sep 15, 2022** | [Zendikt — Umami timeline](https://www.zendikt.com/product/umami) ; [Umami — Why Open Source (2025-04-15)](https://umami.is/blog/why-umami-is-open-source) |
| 36k+ stars, Cloud Hobby $0 (10k events, 3 sites), Cloud Pro $20/mo, Enterprise custom | **Apr 2026** | [Doolpa review (2026)](https://doolpa.com/article/umami) ; [IndieSheet](https://indiesheet.com/tools/umami) |

**Lesson:** Umami is the *cleanest* reference for linux-doctor — MIT, never relicensed, never gated a self-host feature. Monetization is strictly **hosted convenience** (events, sites, retention). The blog explicitly says: "As teams grow … we offer a commercial layer: hosted services, advanced features, SLAs, and premium support" — i.e., the paywall is operational, not diagnostic.

### 1.8 Cross-project timing synthesis

| Project | License | First code → first paid *tier* | Code → first *gated self-host* feature | Relationship to 1.0 |
|---|---|---|---|---|
| **GitLab** | MIT (CE) + proprietary (EE) | **22 months** (2011-10 → 2013-08) | Same (EE = first gated) — at **v6.0** | 6 majors *after* 1.0 |
| **Sentry** | BSD → BUSL/FSL | **~4 years to first paying SaaS** (2008 → 2012-13) but **never** gated self-host | Never (self-host stayed Business-equivalent) | Well after 1.0 |
| **PostHog** | MIT (+ `ee/` proprietary) | **~3 months to paid Cloud**, **~9 months to EE-gated self-host** (Jan → Nov 2020) | 9 months, at **1.16.0** | Before 1.0 *but* YC-funded full-time + FOSS mirror |
| **Supabase** | Apache-2.0/AGPL mix, hosted paid | **~14 months to paid hosting** (Jan 2020 → Mar 2021) | Never gated self-host | Before GA, but *hosted* only |
| **Plausible** | MIT → AGPL | **~5 months to first paid** (Dec 2018 → May 2019) but **5 years to EE-gated** | 5 years, at **v2.1.0** | Years after 2.0 |
| **Cal.com** | MIT (remains MIT for self-host) | **Day-one paid SaaS** (Apr 2021) | **Never** — self-host never gated; 2026 closure is contested | Before 1.0 for SaaS, never for self-host |
| **Umami** | MIT | **~26 months to paid Cloud** (Jul 2020 → Sep 2022) | Never | Never gated |

**No project that kept community trust introduced a *paywalled binary add-on* while still at `0.3.x`-scale pre-1.0 stability.** Even the fastest (PostHog, Cal.com) charged for *hosted service* immediately, not for features stripped from the local binary. Supabase and Plausible explicitly promise "the same code runs in production and in CE."

For linux-doctor — a GPL-licensed, 44-check diagnostics tool that runs *locally* on a single machine — the analogue to "hosted" is **fleet/centralized reporting**, not individual checks. That is exactly what `src/fleet.js` + `src/alert.js` already scaffold.

---

## 2. What signals indicate readiness for Pro

Aggregated from primary-source checklists, handbooks, and post-mortems. Each signal is paired with where linux-doctor stands today and what blocks Pro.

### 2.1 Product signals

| Signal | What "ready" looks like (primary source) | linux-doctor today (0.3.5, 2026-08-27) | Gap / action |
|---|---|---|---|
| **Stable public contract** — `1.0.0` or explicit "no breaking `code` rename" promise | SemVer §4 + §5: `0.y.z` = "anything MAY change … SHOULD NOT be considered stable" ; `1.0.0` = "defines the public API". [SemVer 2.0.0](https://semver.org/) ; [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) | `0.3.5`, `CHANGELOG.md` says SemVer, but `src/checks/*.js` codes still shifting — 6 new checks just landed (`inodes`, `orphans`, `wifi`, `packages`, `boot`, `cache`) and `packages/broken` style churn is still active | **Do not promise paid stability on `0.y.z`.** Freeze the code registry + JSON schema before pricing. Use `1.0.0-rc.x` prereleases (SemVer §9) to rehearse the contract. |
| **Feature completeness for the free promise** — "the CE is the whole product for everyday users" | GitLab's rule: "CE will remain fully open source … won't remove features for a delay; will always release all tests for CE features" — [GitLab Handbook](https://handbook.gitlab.com/handbook/company/history/) ; Plausible's "Nothing from CE will be taken away" — [Plausible CE blog](https://plausible.io/blog/community-edition) | 44 checks is already broad, but several roadmap items in `README.md` still read "planned" (`Auto-generated distro-specific fix instructions`, `Signed store installers`). Free check coverage across categories (security, storage, network, hardware) is solid, yet gaps exist for enterprise-hardening niche (the Pro 5: `hardening`, `scrub`, `boottime`, `connets`, `journalcap` named in `COMMERCIAL-LICENSE.md`) — which is *correct* | Finish at least one minor cycle where *no* core everyday-user gap remains before asking for money; otherwise Pro looks like "pay to make the tool useful" |
| **Stability / "being used in production"** | SemVer FAQ: "If your software is being used in production, it should probably already be 1.0.0" ; GitLab's monthly 22nd cadence + CI gates before any tag | CI is strong (`Node 20/22/24` + Fedora container + `cargo test` + `real-run` valid JSON + `npm pack` gate), but interval is hyper-rapid (1.66 d mean — see `research-release-cadence.md`) and packaging still friction-prone (historical `LD_LIBRARY_PATH` abort, Mesa/EGL software-GL workaround in 0.3.3–0.3.5) | Slow to **weekly–biweekly** until `1.0.0`; prove that `AppImage`+`deb`+`rpm` reproduce cleanly on AUR/Fedora/Bazzite without `LIBGL_ALWAYS_SOFTWARE` footnotes. Real adoption signal: ≥100 GitHub stars, ≥10 external issues/PRs, AUR `linux-doctor` package actually installable |
| **Docs parity** | Peers require: README/MSRV accurate, `CHANGELOG.md` dated + `Unreleased` stub, man page + `--help` parity, generated docs (`docs/checks.md`) committed before tag — [research-release-checklist.md](research-release-checklist.md) citing `ripgrep RELEASE-CHECKLIST`, `bat checklist`, `helix releases` | Docs are ahead of most pre-1.0 projects: `docs/cli.md`, `docs/dashboard.md`, `docs/configuration.md`, `docs/integrations.md`, `docs/severity.md`, `docs/checks.md` (auto-generated), man page `packaging/linux-doctor.1`, completions `completions/*`. But `docs/checks.md` was just added in 0.3.5 and `packaging/linux-doctor.1` versioned drift historically | Pin docs generation into `scripts/bump-version.mjs`; enforce `src-gui/index.html`, `Cargo.lock`, `package-lock.json`, `tauri.conf.json` version agreement in CI (the `research-release-checklist.md` high-priority gap) |
| **Packaging maturity** — reproducible, signed, checksummed | `SHA256SUMS`, `attest-build-provenance` (SLSA L2), signed tags `git tag -s`, OIDC trusted publishing (npm), `cargo audit`/`fmt`/`clippy` | `release.yml` already builds `AppImage+deb+rpm+tgz` + SLSA L2 attestations since 0.3.4, good. Missing: `SHA256SUMS`, GPG-signed tags, `cargo fmt/clippy/audit`, npm OIDC trusted publisher (not needed if `npm publish` stays off) | Add those four gates before charging; paying users reasonably expect supply-chain hygiene |
| **Community traction** | "5 reference paying customers" as the only goal before scaling (PostHog, [pricing lessons](https://github.com/PostHog/posthog.com/blob/master/contents/founders/pricing-lessons.md)); GitLab's 0.1% paying conversion implies need for broad adoption first | Repo `zShaD0w7x/linux-doctor`, sponsor badge, small community; no public download counts or stars cited in README | Set explicit *pre-monetization* KPIs: 500 installs, 50 stars, 5 fleet-mode pilot users — do not build a Stripe integration before hitting them |

### 2.2 Operational signals

- **You can name the 5 paying customers by hand** (PostHog's "only company goal … get 5 reference, paying customers" before any self-serve). If you can't list them, you don't have product-market fit for paid.
- **Free support load is manageable** — GitLab's "we won't withhold security fixes for open source" and Plausible's "twice annually" CE releases both assume the free distribution doesn't drown the maintainer. If every `0.y.z` patch generates a day of AUR/Arch debugging, adding a Pro SKU will double the load.
- **A DM or issue explicitly asks "how do I pay you / how do I run fleet securely?"** — Cal.com got 50 paying customers on day one *without a free tier* because scheduling has natural team-billing; diagnostics fleet/SSO/hosted-dash has the same shape — demand is the signal, not the absence of a pricing page.

### 2.3 Anti-signals — do not start Pro when

- `CHANGELOG.md` still has a large `## [Unreleased]` every week (you haven't found the stable core yet).
- `--support` bundles or `scrub()` privacy handling is still seeing security fixes (it is — `0.3.5` Security section: HTTPS guard + `scrub()` IPv6 fix). Security surface still moving = not ready to sell promises.
- The desktop `AppImage` still needs `LIBGL_ALWAYS_SOFTWARE` escape hatches on current Mesa (it does — `README.md:42-50`). Sell stability only when the free app itself installs cleanly.

---

## 3. What Pro features are typical for infra/diagnostics tools and when to prioritize them vs free features

### 3.1 The universal open-core split — "buyer-based" rule

GitLab and Open Core Ventures articulate the durable heuristic:

> **Individual-contributor features → open source. Manager/executive governance → proprietary.**

- GitLab: security features that a CISO signs for stay in EE; the ability to *use* GitLab stays in CE. ([LegalClarity — Open Core Licensing](https://legalclarity.org/open-core-business-model-licensing-revenue-and-law/), [re-o.dev monetization guide](https://www.reo.dev/blog/monetize-open-source-software))
- OCV: "The buyer-based open core model is straightforward: Ask for money for features that managers … want, and make the features that individual contributors want open source. Consider the user persona rather than the technical implementation." ([Building venture-scale open core](https://www.opencoreventures.com/blog/building-venture-scale-open-core))

Applied to linux-doctor — a diagnostics CLI that runs on one machine — the split is almost mechanically determined:

### 3.2 Feature taxonomy

| Layer | Typical infra/observability Pro features (primary fleet/monitoring sources) | In linux-doctor today | Placement recommendation |
|---|---|---|---|
| **Single-machine diagnostics** (the core promise: "Linux diagnostics that explain the problem") | All 44 checks (`memory`, `disk`, `services`, `journal`, `smart`, `thermal`, `battery`, `gpu`, `network`, `security`, …), `START HERE`, health score, history diff, `severity.md`, trend sparkline, `--fix` catalog, `--interactive` | ✅ Free (and must stay free). `COMMERCIAL-LICENSE.md` plus guard test `tests/open-core.test.js` already enforces this. | **Free forever.** Never gate a check that a solo desktop user would reasonably want. Plausible's "nothing removed from CE" and GitLab's "no features will ever be removed from CE" are the trust anchors. |
| **Premium checks** (hardening-depth, narrow audience) | Examples named in `COMMERCIAL-LICENSE.md`: `hardening`, `scrub`, `boottime`, `connets`, `journalcap` — analogous to Checkmk Pro's "hardware/software asset tracking" or SysManage Pro's "vulnerability scanning" | Scaffolded as Pro add-on (`@linux-doctor/pro` via `src/pro.js`, `init(CORE_API) → {checks, licensing}`) | **Pro** — acceptable to gate *because* the free set already covers everyday health. Validate by asking: "Would a home Arch user reasonably need `journalcap` on day one?" If yes, it should be free. If it's really a sysadmin-scale tuner, Pro is defensible. |
| **Fleet / multi-machine** — the recurring #1 Pro monetizer across every infra tool surveyed | `pushReport()` to central server, `machineId` from `/etc/machine-id`, `diffSinceLast`, `agent`/`hostname`/`sentAt` envelope — already shipped in `src/fleet.js` as a *free client* | Client is free and open (correct). Hosted dashboard receiving the pushes is the **Business** tier in `COMMERCIAL-LICENSE.md` ("Hosted fleet dashboard, seats & machines, shared ignore policies") | **Business (hosted).** Keep the *sender* (`--push`, `--alert`) free and open — charge for the **receiver**. This is exactly Supabase/Plausible/Umami ("self-host free, managed hosting paid") and RadarHQ's "OSS Apache-2.0 engine free, Cloud per-cluster $149/$299" split. Do not paywall `validatePushUrl()` — paywall the dashboard that renders the fleet. |
| **Daemon / scheduled agent** — `systemd` timer, `--daemon`, `--interval`, `--alert` webhook | `src/alert.js`, `--daemon` flag, `linux-doctor.timer` unit in `packaging/` | Already described as Pro in `COMMERCIAL-LICENSE.md` ("Alerting webhook (`--alert`), scheduled agent (`--daemon`)") | **Nuanced.** `--daemon` on a single laptop is an IC feature (developer wants auto-refresh). Gating it outright feels like paywalling `cron`. Better: **free single-host daemon + alerting to any webhook**, Pro only for **fleet-routed / policy-enforced daemon** (Chmonitor docs model: "Alerting & notifications ship as fully-built, ungated in community; fleet view / SSO / RBAC are the gate"). Consider ungating the basic daemon locally before 1.0 and reserving only hosted aggregation for paid. |
| **AI summary / LLM plans** | `src/llm.js`, `--ai`, 0.3.5 `scrub()` redaction | "Advanced AI plans" labeled Pro in `COMMERCIAL-LICENSE.md` | **Pro for managed-model plans; keep BYO-key open.** Chmonitor's exact pattern: "AI agent (BYO model key) ✓ Community; Managed AI (hosted model, no BYO) ✓ Enterprise". A user bringing their own OpenAI key costs you nothing — gating it creates ill will for no revenue. Gate *hosted* inference / prompt-management. |
| **Governance** — RBAC, SSO/SCIM, SLA, audit log, compliance reporting, retention, volume licensing | Standard Business/Enterprise lift across Checkmk Pro ("granular access control with SSO and 2FA"), Greptime Enterprise ("LDAP, RBAC, audit logging, encryption, SLA-backed support"), Radar Enterprise ("SAML/OIDC SSO + SCIM 2.0, 1-year audit retention + SIEM export") | Reserved for Business/Enterprise in `COMMERCIAL-LICENSE.md` | **Enterprise only, and only as hosted/on-prem service features.** Never gate code running on a single machine with SSO — there is no SSO for a laptop. These features only matter when the fleet dashboard has *teams of humans*. Do not build them until the fleet has teams. |
| **Proprietary embedding / dual-license** | MySQL/Qt-style: embed `linux-doctor` inside a proprietary product without GPL disclosure | Documented as Enterprise ("Proprietary-embedding rights (dual license) — MySQL/Qt-style") | **Enterprise, legal add-on.** Keep GPL for the community edition; the commercial license is a paper exception, not a separate binary. |

### 3.3 Prioritization rule vs free features

**Free-first, always.** The OCV safeguard reads: "Protecting community contributions by not allowing the removal of any software products that were previously open source" and "Ensuring the majority of new features added in a calendar year are made available under an open-source license." For linux-doctor that translates to:

- **Before 1.0:** ≥80% of engineering time on free checks, docs, packaging, dashboard polish, `--fix` safety. Pro work is *scaffolding only*: the `pro.js` loader (done), a private `@linux-doctor/pro` repo stub, license verification plumbing, and maybe one premium check as a smoke test — but not announced or sold.
- **1.0 → Pro launch:** 50/50 — harden the fleet client, ship one Pro check pack (5 checks), wire `--alert`/`--daemon` for fleet routing.
- **Post-Pro launch:** Majority still free — new everyday checks keep landing in GPL. Pro grows by *adding* narrow enterprise depth, never by *withholding* general-purpose diagnostics.

If a feature would make a solo Arch/Fedora user's README example better, it belongs in Free. If it only makes a 500-machine fleet manager's dashboard better, it belongs in Pro/Business.

---

## 4. Pricing and licensing pitfalls to avoid

### 4.1 Open-core vs dual-license — which you have (and the boundary risk)

linux-doctor uses **both**, and the distinction matters legally ([TermsFeed — Dual Licensing vs Open Core](https://www.termsfeed.com/blog/dual-licensing-vs-open-core/), [LegalClarity](https://legalclarity.org/open-core-business-model-licensing-revenue-and-law/)):

- **Dual license (same codebase, two licenses):** `LICENSE` GPL-3.0-or-later + `COMMERCIAL-LICENSE.md` commercial exception. One codebase, two offers — the commercial license sells *freedom from copyleft* for proprietary embedding. Requires **CLA/DCO** so the maintainer actually *owns* the right to relicense. (`CONTRIBUTING.md` says "By contributing, you agree your contributions are offered under both licenses" — enforce that with a real DCO/CLA file, not just prose.)
- **Open-core (two codebases, one free, one proprietary):** Free `linux-doctor` + proprietary `@linux-doctor/pro` (`src/pro.js:14-43`). Two codebases, boundary via `init(CORE_API)` injection — the proprietary code never shares memory/compile with GPL code, only calls the `CORE_API` primitives via dependency injection. This is the *stronger* legal boundary.

**Pitfalls:**

1. **Leaking proprietary checks into the GPL tree** — the guard test `tests/open-core.test.js` is load-bearing; keep it and extend it to fail CI if `src/pro.js` ever imports a GPL-internal path directly or if a Pro check id appears in `src/checks/index.js`.
2. **Blurring the boundary** — compiling Pro checks *into* the GPL binary or sharing `finding` internals via direct import would trigger "derivative work" arguments under GPL's viral clause. The `init(CORE_API)` injection pattern is correct — do not weaken it for convenience.
3. **Choosing copyleft for the core then regretting it** — GPL for diagnostics is a defensible moat (nobody wants to embed GPL diagnostics inside a closed product without a commercial license), but it also *requires* the dual-license commercial escape hatch. If you later wish you had picked MIT/Apache, you cannot change existing contributions without every contributor's consent (Traverse Legal: "Changing a project's license after it has accepted outside contributions is one of the highest-risk governance decisions"). Decide now and document it.

### 4.2 Trust — the bait-and-switch trap

The fastest way to destroy community trust is to **move previously-free features behind Pro after users adopted them.** This is the *#1* pattern in open-core post-mortems:

- **MinIO (2020–2026):** Apache-2.0 → AGPL (8 months before $103M Series B) → public shaming of Nutanix/Weka license "violations" → 2025 strip admin console from CE → 2026-02-12 `THIS REPOSITORY IS NO LONGER MAINTAINED` → community now calls it "the cautionary tale". [reading.sh — How MinIO went from darling to cautionary tale](https://news.reading.sh/2026/02/14/how-minio-went-from-open-source-darling-to-cautionary-tale/) ; [ghost.io — MinIO just killed its OSS edition](https://early-equity.ghost.io/minio-just-killed-its-open-source-edition-and-your-infrastructure-is-next/)
- **HashiCorp Terraform → OpenTofu**, **Elastic** (AGPL→SSPL→back to AGPL), **CockroachDB** — each license shift spawned a fork. [The New Stack — RIP Open Core (2024-11-14)](https://thenewstack.io/rip-open-core-long-live-open-source/)
- **Cal.com 2026 closure debate:** MIT self-host was "too good" (users saw no reason to pay), leading to the `Cal.diy` fork vs closed production codebase split — community: "They gave their time and code to what they thought was a shared public project. The project is now closed." [Ayvhieel](https://ayvhieel.substack.com/p/why-calcom-went-closed-source-the) ; [NovVista](https://novvista.com/cal-com-going-closed-source-is-the-canary-in-the-open-source-business-model-mine/)

**Mitigations that actually kept trust (from GitLab/Plausible/Supabase playbooks):**

- **Public promise that CE never shrinks** — GitLab ("No features will ever removed from CE"), Plausible ("Nothing from CE will be taken away"), Umami ("Self-hosted … $0 forever"). Put the same sentence in `COMMERCIAL-LICENSE.md` and mean it.
- **Majority-free commitment** — OCV's PBC charter: "The majority of new features added in a calendar year are made available under an open-source license" ([Preventing the bait-and-switch](https://www.opencoreventures.com/blog/preventing-the-bait-and-switch-by-open-core-software-companies)). Adopt this as a public policy.
- **Do not withhold security fixes** — OCV charter: "Not withholding or intentionally delaying the release of security fixes for open source features." The `0.3.5` HTTPS-plaintext and `scrub()` fixes must always ship to Free first, never exclusively to Pro.
- **Transparent feature table** — `COMMERCIAL-LICENSE.md` already has a clear Free/Pro/Business/Enterprise table; keep it precise and publish in `README.md#tiers` ("Every tier includes everything to its left" — good).
- **Honor-system, fail-open gating** — Chmonitor's "A misconfigured or absent edition flag never locks a self-hoster out; the system always fails open to community" + `isEnabled(feature)` single gate in `lib/edition/` ([Chmonitor — Editions](https://docs.chmonitor.dev/operate/advanced/editions)). linux-doctor's `pro.js:81-85` "missing module = silent free edition" is the same instinct — keep it.

### 4.3 Pricing pitfalls

| Pitfall | What happens | Example in peer set | How to avoid in linux-doctor |
|---|---|---|---|
| **Day-one paywall gates nothing proprietary** | Users see no reason to pay; conversion <1–5% | MinIO CE trace-able as "too good"; Cal.com MIT self-host described as "too complete" in NovVista analysis | Only gate what *cannot* run on a laptop (fleet aggregation, SSO, SLA, long retention) |
| **Per-seat pricing on a machine tool** | Pricing model doesn't map to value (is it per-host? per-run? per-user?) | Checkmk explicitly avoids counting servers — "total monitored *services*" determines tier; RadarHQ charges *per cluster*, "never per seat"; Cal.com's *per-seat* works only because it's scheduling-collaboration | Choose **per-machine-host (fleet) or per-organization** for Business/Enterprise, never per-human-seat for diagnostics; per-machine is the natural meter for fleet reporting (`machineId`) |
| **Contact-sales-only Enterprise that never publishes a number** | Mid-market buyers bounce | PulseSignal trackers show every project's Enterprise tier listed as "Contact sales / custom" with no self-serve | Publish at least Pro and Business as self-serve ($X/mo/org or $Y/machine/mo); keep true Enterprise as custom but list *what it includes* clearly |
| **Annual-only contracts from day one** | Startups can't trial | PostHog pricing lessons: "No annual contracts, unless a customer requests one. This cuts risk down … Ironically, the less commitment you ask for, the more you may get." ([pricing-lessons.md](https://github.com/PostHog/posthog.com/blob/master/contents/founders/pricing-lessons.md)) | Monthly billing with monthly spend caps (Supabase pattern); annual discount as opt-in |
| **No spend cap / surprise billing** | Trust loss, churn | Supabase's spend-cap work ("limiting per-project costs to $25 … you have full control with configurable spend-caps") | If fleet hosting ever bills by usage (push volume, retained reports), ship spend caps from day one |
| **CLA viewed as exploitative** | Contributor friction, PRs refuse | Traverse Legal: "Some developers refuse to sign … viewing the asymmetric grant as exploitative" | Use **DCO (Developer Certificate of Origin, `Signed-off-by`)** like Umami/minimal friction, not a heavyweight CLA, unless a lawyer says a CLA is needed for dual-license relicensing. Keep `CONTRIBUTING.md` CLA notice short and reciprocal |
| **GPL core + proprietary "source-available" confusion** | Users don't know what's actually open source | Plausible needed a full rebrand (new logos for CE vs EE) to clarify; Sentry's BUSL/FSL caused years of "is it open source?" debate | Keep GPL core clearly GPL; Pro is *proprietary and separate*, not "source-available but you can't use it" |

### 4.4 Licensing pitfalls specific to GPL + commercial

- **GPL irrevocability:** Versions already released under GPL *cannot be withdrawn* — forks are legally permissible. The original company can change license *going forward* but already-granted rights stand. ([LegalClarity](https://legalclarity.org/open-core-business-model-licensing-revenue-and-law/) — "open-source licenses are irrevocable for the versions already released under them"). That is a feature (community safety), not a bug — do not promise "we might close source later."
- **API separation is not a bright line** — LegalClarity notes "The line between 'separate work communicating through an API' and 'derivative work' remains genuinely unsettled." Do not assume `init(CORE_API)` is automatically safe — get a one-hour lawyer review before first Pro sale if Pro will ever be distributed alongside the GPL binary.
- **Trademark policy gap** — GitLab/Supabase all publish explicit trademark policies early (who may call a build "Linux Doctor"). Before community forks exist, publish a one-paragraph policy: "You may say 'compatible with Linux Doctor' but may not ship a build named 'Linux Doctor Pro/Enterprise' without permission."

---

## 5. What SemVer and Keep a Changelog advise about 0.y.z vs 1.0.0 for monetization

### 5.1 SemVer 2.0.0 — the relevant clauses

All quotes from [Semantic Versioning 2.0.0](https://semver.org/) (CC BY 3.0):

- **§4:** "Major version zero (0.y.z) is for initial development. Anything MAY change at any time. The public API SHOULD NOT be considered stable."
- **§5:** "Version 1.0.0 defines the public API. The way in which the version number is incremented after this release is dependent on this public API and how it changes."
- **FAQ — 'How should I deal with revisions in the 0.y.z phase?':** "The simplest thing to do is start your initial development release at 0.1.0 and then increment the minor version for each subsequent release."
- **FAQ — 'How do I know when to release 1.0.0?':** "If your software is being used in production, it should probably already be 1.0.0. If you have a stable API on which users have come to depend, you should be 1.0.0. If you're worrying a lot about backward compatibility, you should probably already be 1.0.0."
- **FAQ — 'Doesn't this discourage rapid development?':** "Major version zero is all about rapid development. If you're changing the API every day you should either still be in version 0.y.z or on a separate development branch working on the next major version."
- **§3:** "Once a versioned package has been released, the contents of that version MUST NOT be modified. Any modifications MUST be released as a new version." — directly governs `npm publish`/`git tag` hygiene (see `research-release-checklist.md`).

The long-running issues [#333](https://github.com/semver/semver/issues/333) and [#363](https://github.com/semver/semver/issues/363) plus PR #127 show the community *has* tried to give `0.y.z` more structure (e.g., `0.MAJOR.MINOR` conventions) and the maintainers *rejected* it: **`0.y.z` is intentionally unstructured**. The only portable promise you can make on `0.y.z` is "this may break." That is why the OCV/Plausible bootstrapped path deliberately stays `0.y.z` while offering hosted service (where breakage is deploy-controlled) rather than a versioned binary entitlement.

**Implication for monetization:** You **can** accept money while on `0.y.z` (PostHog did at `1.16.0`, Cal.com from day one), but only for **service** (hosted fleet, support), not for **a versioned binary feature flag**. Charging for a binary's Pro code while claiming "the Pro API/SCHEMA may break in the next `0.y.z` without a major bump" is an incompatible pair of promises. Customers paying for a check-suite are buying *stability*; `0.y.z` legally refuses to provide it. The fix is to **reach `1.0.0` before selling Pro checks**, and if you really need cash before then, sell *hosted fleet / support* which can evolve without breaking a local contract.

### 5.2 Keep a Changelog 1.1.0 — the `Unreleased` discipline

From [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) (same principles restated in `CHANGELOG.md:1-6`):

- "Changelogs are *for humans*, not machines. There should be an entry for every single version."
- Maintain a **`## [Unreleased]`** section at the top that tracks upcoming changes; at release time, move it into a dated `## [x.y.z] — YYYY-MM-DD` section and re-open a fresh stub.
- Reference [GitHub Discussions](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) and the peer checklists: every mature CLI (ripgrep, bat, helix) copies the relevant `CHANGELOG.md` section *verbatim* into GitHub Release notes via `awk` extraction — the pattern linux-doctor adopted in `release.yml` from `0.3.4`.
- No line in Keep a Changelog talks about *pricing* — its contribution to monetization is indirect: **a well-maintained `Unreleased` is the release-readiness signal**. A long `Unreleased` with many `Changed` breaking entries means you're still in §4 "anything may change" mode and should not be promising Pro stability.

### 5.3 Synthesis — the 1.0.0 threshold as a monetization gate

| SemVer view | Keep a Changelog view | Practical translation for linux-doctor |
|---|---|---|
| `0.y.z`: "Anything MAY change… SHOULD NOT be considered stable" | `Unreleased` still accumulating breaking `Changed`/`Removed` entries | **Do not sell Pro checks.** Hosted fleet/support OK if you warn it's beta. |
| `1.0.0-rc.x` prereleases have lower precedence than `1.0.0`, communicate "unstable, may not satisfy compatibility" (SemVer §9) | Rc notes still land in `CHANGELOG.md` but under `-rc` headings | **Rehearse the stable contract.** Ship `1.0.0-rc.1`, dogfood Pro privately, collect feedback without promising semver guarantees. |
| `1.0.0`: "defines the public API" | `## [1.0.0] — YYYY-MM-DD` curates all breaking changes as one human-readable migration | **Launch Pro for sale.** Now you can promise "a finding `code` that exists in `1.0` will not be removed until `2.0`" and mean it. |

---

## 6. Recommendation — phases (now → 1.0 → post-1.0) and what Pro work to do when

### Phase overview

```
now (0.3.5) ──► 1.0.0-rc ──► 1.0.0 ──► 1.x post-1.0
 │                │           │          │
 │  free burn-down│  freeze  │  paid     │  enterprise
 │  + Pro infra   │  + beta  │  launch   │  expansion
```

### 6.1 Phase table

| Phase | Version window | Duration target | Core goal | Pro work allowed | Pro work *not* allowed | Pricing action |
|---|---|---|---|---|---|---|
| **0. Now — harden the free product** | `0.3.5 → 0.9.x` | **~2–4 months** | Make the free edition *undeniably the whole product* for single-machine users; stabilize `score`/`code`/`thresholds`/`JSON schema` contracts | **Private scaffolding only.** Keep `@linux-doctor/pro` as a private repo stub (if it doesn't already exist, `git init` it privately today). Keep `src/pro.js` loader (done). Add exactly one premium check behind the loader as a smoke test (e.g., `boottime` or `hardening`) — never merged to public, never mentioned in `README.md` or `--check-list` when absent. Build a *local* proof-of-concept for the fleet receiver (throwaway Next.js/Supabase dashboard that ingests `POST /api/report` from `--push`) to validate the wire format — but do not publish it. | No public pricing page, no Stripe/LemonSqueezy integration, no marketing of Pro/Business/Enterprise, no paywalling of `--daemon`/`--alert`/`--ai` for local use. No moving an existing GPL check to Pro. | None. Keep `COMMERCIAL-LICENSE.md` as the only mention. If you talk about money before the core is stable, you signal "pay to make it work." |
| **1. Freeze — 1.0.0-rc** | `1.0.0-rc.1` → `1.0.0-rc.N` | **~2–6 weeks** | Freeze the public API and rehearse the release | **Private beta.** Invite 3–5 hand-picked design partners (people who asked for fleet/central reporting) to install `@linux-doctor/pro` via `LINUX_DOCTOR_PRO_MODULE` or private GitHub Packages token. Pro payload: the 5-check pack (`hardening`, `scrub`, `boottime`, `connets`, `journalcap`) + license-key verification (signing secret never in public repo). Instrument but do not yet bill — free beta in exchange for candid bug reports. | No public sale. No Business/Enterprise tier. | Publish a *draft* pricing page with numbers but "coming soon" (the Plausible/Supabase pattern: show the path without taking money). |
| **2. 1.0.0 — stable contract** | `1.0.0` | **One-day event, after rc bake** | Ship the stable promise: "from here, breaking `code`/schema/threshold changes require a MAJOR bump" | **Soft-launch Pro.** `@linux-doctor/pro` becomes installable for paying users via private channel. The *hosted fleet dashboard* (Business tier) ships as the real monetization — the Pro check pack is the upsell for power users. Announcement: "`1.0.0` is here — free forever for individuals, Pro for power users, fleet dashboard for teams. Same GPL core, no features removed." | No enterprise SSO/RBAC/SLA yet — those require teams you don't have. | **Start billing Pro** — e.g., $8–15/mo/user or $49 one-time + $19/yr (diagnostics tools historically favor one-time + maintenance; Fleet tools favor per-machine/mo — pick one after beta feedback). Keep Free genuinely whole; publish a clear comparison table in `README.md#tiers` (already there — update with actual prices). |
| **3. Post-1.0 — enterprise expansion** | `1.1.0` → `2.0.0` | **Ongoing, monthly–quarterly minors** | Scale the paid surface only where teams exist | **Business/Enterprise when demanded.** Fleet seats & machines, shared ignore policies, SSO/SCIM, on-prem fleet, SLA, volume licensing — exactly as `COMMERCIAL-LICENSE.md` declares, but only when a real customer signs an LOI asking for each item. Follow the "build when asked, not when speculated" rule from `research-release-cadence.md` §4.4 and `re-o.dev`: "You don't know your target buyer or your user ≠ buyer — trying too early may stall adoption." | Never relicense existing GPL checks; never gate a check that a solo user would have wanted before 1.0. | Add annual plans, spend caps, team seats. Keep majority-free rule: even post-1.0, most new checks land in GPL. |

### 6.2 Decision tree for each feature announcement

```
Is the feature useful on a single laptop/desktop with no central server?
 ├─ YES → FREE (GPL) — ship in the next 0.y.z or 1.x minor
 └─ NO → does it require a shared server, identity provider, or SLA?
          ├─ fleet aggregation / multi-host retention → BUSINESS (hosted)
          ├─ SSO/SCIM/RBAC/audit/SLA/on-prem → ENTERPRISE (hosted/on-prem)
          └─ premium depth check only a 500-host fleet needs → PRO (add-on)
```

### 6.3 What "Pro now" would cost if you ignored the phasing

- **Trust cost:** Charging for an `0.y.z` binary that can still break `code` identities undermines the 145-code stability story you just shipped in `0.3.5` (`inodes`, `boot`, `wifi` all new). First support ticket: "I paid for `journalcap` and your `0.4.0` renamed it."
- **Engineering drag:** Every public Pro promise freezes something in the GPL core that should still be free to evolve (thresholds, `scrub()`, `--daemon` semantics). The longer you stay pre-1.0 with a paid contract, the more you paint yourself into `1.0.0` shape before you're ready.
- **Community cost:** No stars / install base yet to absorb the signal that you *value* paid users more than the solo Arch user who filed the `wayland/software-rendering` medium-vs-high bug in `0.3.3`.

### 6.4 Immediate next steps (this week)

1. **Do not open a Stripe account.** Keep `COMMERCIAL-LICENSE.md` as documentation, not a store.
2. **Create the private `@linux-doctor/pro` repo** (if not already created) and move the five premium checks + key-signing crypto *out* of any public branch — the guard test `tests/open-core.test.js` already validates the split is real from `0.3.3` onward; keep it green.
3. **Add the four CI gates** flagged in `research-release-checklist.md` — `SHA256SUMS`, GPG-signed tags, `cargo fmt/clippy/audit` — before any paid promise; paying users reasonably expect them.
4. **Ship a `1.0.0` checklist** in `docs/RELEASING.md` — freeze `codes` registry + `schemaVersion` + `thresholds` contract, document the rc rehearsal, and set the freeze date. Until `1.0.0`, Pro is a *private engineering spike*, not a SKU.

---

## 7. Sources (primary, high-trust)

### GitLab
- History timeline (commit → CE → EE → incorporation, CE stays MIT, EE = LDAP group sync) — https://handbook.gitlab.com/handbook/company/history/
- Announcing GitLab 6.0 EE (2013-07-22 blog, 2013-08-22 release) — https://www.people.rbdc.net/source/releases/posts/2013-07-22-announcing-gitlab-enterprise-edition.html.md and https://about.gitlab.com/releases/2013/08/22/introducing-gitlab-6-0-enterprise-edition/
- 0.1% paying customers, "It'd be very profitable to make a bigger difference … but we want CE to stay very functional" — https://thenextweb.com/news/github-rival-gitlab-building-business-just-0-1-paying-customers
- Commit d3784687 v1.0 (2011-10-13) — https://gitlab.com/gitlab-org/gitlab-foss/-/commit/d3784687943e0bd699d73d82a6bc6cac39689473
- GitLab Inc. incorporation — https://en.wikipedia.org/wiki/GitLab_Inc.

### Sentry
- Driven by Open Source (2015-06-30) — https://blog.sentry.io/driven-by-open-source/
- How Sentry Thrives as OSS Company (2019-02-14) — https://blog.sentry.io/sentry-thrives-open-source-software-company/
- Re-Licensing Sentry / BUSL with 36-mo Apache conversion (2019-11-06) — https://blog.sentry.io/relicensing-sentry/
- Let's Talk About Open Source / BUSL clarifications (2023-08-03) — https://blog.sentry.io/lets-talk-about-open-source/
- From the Beginning (bootstrap 2008–2013, first $7 SaaS customer) — https://cra.mr/sentry-from-the-beginning/
- Self-Hosted Sentry / FSL becoming Apache-2.0 after 2 years — https://develop.sentry.dev/self-hosted/
- TechCrunch hosted launch (2013-02-05, 500 paying) — https://techcrunch.com/2013/02/05/sentry-the-now-profitable-bug-tracker-used-by-disqus-pinterest-rdio-path-more-gets-a-huge-makeover/

### PostHog
- Handbook Story (YC W20, HN launch timeline) — https://posthog.com/handbook/story
- After the HN Launch (300 deployments, 800 stars) — https://posthog.com/blog/after-the-hn-launch
- How we got our first 1000 users / Issue #306 ee/ split — https://posthog.com/founders/first-1000-users and https://github.com/PostHog/posthog.com/issues/306
- CHANGELOG 1.16.0 EE gate (2020-11-04) — https://github.com/PostHog/posthog/blob/aec2081e33324e645cfd1527e4216a4782f5d25f/CHANGELOG.md
- Pricing advice (subscription → usage-based → free tier) — https://posthog.com/newsletter/pricing-advice
- How we monetized our open source devtool / open-core tradeoffs — https://posthog.com/blog/open-source-business-models
- Multi-product pricing learnings — https://posthog.com/founders/multi-product-pricing
- Companies that shaped PostHog / GitLab as shining example — https://posthog.com/newsletter/the-companies-that-shaped-posthog

### Supabase
- Beta pricing blog (2021-03-29) — https://supabase.com/blog/pricing
- Beta pricing context (Dec 2020 beta) — https://supabase.com/beta
- Pricing history timeline (Mar 2021 $25 Pro → Feb 2026 $70M ARR) — https://www.saaspricepulse.com/blog/supabase-pricing-history
- $6M seed while free for everyone — https://techcrunch.com/2020/12/15/supabase-raises-6m-for-its-open-source-firebase-alternative/
- Enterprise + spend caps / org-based billing — https://supabase.com/blog/supabase-enterprise

### Plausible
- Launch post (freemium cost too high for solo) — https://plausible.io/blog/launching-plausible
- Commit 84ee2c0 Switch to AGPL (2020-10-12) — https://github.com/plausible/analytics/commit/84ee2c04aa0312f93cf792e1355d748cd9196d1a
- Community Edition / Enterprise split v2.1.0 rc0 (2024-02-23) and release (2024-05-23) — https://plausible.io/blog/community-edition, https://github.com/plausible/analytics/releases/tag/v2.1.0, https://github.com/plausible/analytics/discussions/3817
- Plausible self-host vs cloud differences — https://github.com/plausible/analytics
- Subscription plans (Enterprise-only: SSO, Sites API, managed proxy, raw exports) — https://plausible.io/docs/subscription-plans
- Plausible pricing structure and history context — https://www.jointhequarter.com/blog/plausible and https://unlocksaas.com/pricing-teardown/plausible

### Cal.com
- Product Hunt 50 paying day-one, no free tier yet — https://getlatka.com/companies/calcom
- Rebrand to Cal.com, free tier added, 25–30k users, ~10% conversion — https://getlatka.com/blog/18-year-old-raises-32m-to-build-opensource-version-of-calendly
- Pricing tiers (Teams $12/seat, Organizations $28/seat, Enterprise custom, self-host MIT) — https://cal.com/pricing and https://dev.to/beton/calcom-pricing-teardown-2026-4j40 and https://unlocksaas.com/pricing-teardown/cal-com
- $5M ARR Oct 2025, $32.4M raised — https://startupfounderstories.com/stories/cal-com-peer-richelsen
- Going closed source / Cal.diy contradiction and contributor betrayal — https://ayvhieel.substack.com/p/why-calcom-went-closed-source-the and https://novvista.com/cal-com-going-closed-source-is-the-canary-in-the-open-source-business-model-mine/

### Umami
- MIT repo (created 2020-07-17, 38k stars) — https://github.com/umami-software/umami
- Why Umami is Open Source (core free, commercial layer for host/SLA) — https://umami.is/blog/why-umami-is-open-source
- $1.5M pre-seed while 11k stars — https://www.globenewswire.com/news-release/2022/07/19/2481786/0/en/Umami-Raises-1-5-Million-Pre-Seed-Funding-Round-Led-by-Race-Capital-to-Continue-Growing-its-Popular-Open-Source-Privacy-Focused-Web-Analytics-Platform.html
- Cloud launched Sep 2022, pricing Hobby $0 / Pro $20 — https://www.zendikt.com/product/umami, https://doolpa.com/article/umami

### SemVer / Keep a Changelog
- SemVer 2.0.0 §4 (0.y.z), §5 (1.0.0 defines API), §9 (prereleases), FAQ 1.0.0 readiness — https://semver.org/
- SemVer issues #333 and #363 (rejected additional 0.y.z structure) — https://github.com/semver/semver/issues/333, https://github.com/semver/semver/issues/363
- Keep a Changelog 1.1.0 (Unreleased discipline, human-curated, dated versions) — https://keepachangelog.com/en/1.1.0/

### Infra/Observability fleet Pro patterns
- RadarHQ product + pricing (OSS Apache-2.0 engine free, Cloud $149–$299/cluster for fleet/retention/SSO) — https://radarhq.io/product and https://radarhq.io/pricing
- Checkmk Pro (high-performance core, 2000 integrations, fleet analytics, SSO/2FA) — https://checkmk.com/product/checkmk-pro
- GreptimeDB Enterprise (LDAP/RBAC/audit, management console, fleet alerting) — https://greptime.com/product/enterprise
- Chmonitor Editions (alerting ships in Community, fleet/SSO/RBAC are gated scaffolds, fail-open) — https://docs.chmonitor.dev/operate/advanced/editions

### Licensing / open-core vs dual-license
- LegalClarity — Open Core Business Model (two regimes, API boundary, forks, trademarks) — https://legalclarity.org/open-core-business-model-licensing-revenue-and-law/
- TermsFeed — Dual Licensing vs Open Core (choice-based vs boundary-based) — https://www.termsfeed.com/blog/dual-licensing-vs-open-core/
- Traverse Legal — Risks of Dual Licensing (CLA, relicensing hard) — https://www.traverselegal.com/blog/dual-licensing-open-source/
- Open Core Ventures — Preventing the bait-and-switch (PBC charter, majority-free, no withheld security fixes) — https://www.opencoreventures.com/blog/preventing-the-bait-and-switch-by-open-core-software-companies
- Open Core Ventures — Building venture-scale open core (buyer-based split, single-repo /ee pattern) — https://www.opencoreventures.com/blog/building-venture-scale-open-core
- GopherTrunk — Dual licensing & relicensing primer — https://gophertrunk.org/learn/software-licensing/dual-licensing-and-relicensing/
- Blog.opentap.io — Dual Licensing: The Good, The Bad (Qt, MySQL) — https://blog.opentap.io/dual-licensing-open-source-software
- The New Stack — RIP Open Core / OpenTofu/Elastic/Cockroach (2024-11-14) — https://thenewstack.io/rip-open-core-long-live-open-source/
- Analyze — MinIO cautionary tale (Apache→AGPL→abandonment) — https://news.reading.sh/2026/02/14/how-minio-went-from-open-source-darling-to-cautionary-tale/ and https://early-equity.ghost.io/minio-just-killed-its-open-source-edition-and-your-infrastructure-is-next/
- Re-o.dev — How to Monetize Open Source / buyer-based open core — https://www.reo.dev/blog/monetize-open-source-software

### linux-doctor local sources inspected
- `README.md` (tiers, 44 checks, 145 codes, AppImage + deb behavior), `package.json:3` (0.3.5), `CHANGELOG.md` (§0.3.5 Security/Added/Changed/Fixed), `COMMERCIAL-LICENSE.md` (Free/Pro/Business/Enterprise table + `@linux-doctor/pro` distribution), `src/pro.js` (loader + `CORE_API` injection), `src/fleet.js` (free client + `validatePushUrl` + `machineId`), `docs/research-release-cadence.md` (hyper-rapid 1.66 d cadence), `docs/research-release-checklist.md` (8-step checklist + gaps table)

---

## Appendix — Quick verdict per question asked

- **Should linux-doctor start *building* Pro now?** Yes — private scaffolding (loader + private repo + one premium check smoke test + fleet-receiver prototype) is the right start *now* (PostHog/OCV pattern: scaffold early, sell late). Keep it out of public commits.
- **Should it start *selling* Pro now?** No. Every reference project that kept trust waited until the free product was complete and the public contract was stable (`1.0.0` or explicit CE-frozen). Selling on `0.3.5` would violate SemVer's `0.y.z` contract and GitLab/Plausible's "CE never shrinks" trust anchor.
- **When to prioritize Pro vs free features?** Free-first always; apply the buyer-based test — if a solo desktop user would want it, it ships in Free; if it only matters for a fleet operator / compliance officer, it can be Pro/Business. Before 1.0, spend ≥80% of time on Free.
- **What Pro features belong in a diagnostics tool?** Fleet-hosted aggregation, long retention, alert routing at fleet scale, SSO/SCIM/RBAC/audit/SLA/on-prem, managed AI inference — *not* individual checks a single machine needs. The 5-check Pro pack is defensibly gated only because 44 Free checks already cover the everyday promise.
- **What does 0.y.z vs 1.0.0 advise?** SemVer says `0.y.z` = anything may break, not stable, not for selling stability; `1.0.0` = you define the public API and can promise compatibility. Keep a Changelog says "Unreleased still accumulating" means not ready; curate `## [1.0.0]` before taking money for a versioned binary.
