# 10 — MVP Roadmap

Phases are ordered so that each one ends with something usable, and so that
the riskiest assumption — that a free-tier model is accurate enough — is
tested before the UI around it is built.

No calendar dates are given. Each phase has an exit condition instead; the
next phase starts when it is met.

## Overview

| Phase | Name | Outcome | Release |
| --- | --- | --- | --- |
| 0 | Foundations and AI spike | A proven pipeline and an empty app that builds | — |
| 1 | Manual tracker | A usable offline nutrition log | 0.1 (owner only) |
| 2 | Photo scanning | The core promise works end to end | 0.5 (owner only) |
| 3 | Hardening | Ready for strangers | **1.0 (MVP, public)** |
| 4 | Convenience | Cost display, saved meals, offline queue | 1.x |
| 5 | Reach | F-Droid, iOS, optional sync | 2.x |

## Phase 0 — Foundations and AI spike

| Work | Requirement |
| --- | --- |
| Repository, MIT license, contribution guide, CI (type check, lint, tests) | NFR-09 |
| Expo project, navigation shell, design tokens, English and Spanish scaffolding | FR-01, NFR-06 |
| `core/ai` in plain TypeScript: schema, prompt v1, the three adapters | FR-60 |
| Benchmark harness and a first set of about 30 weighed meals | Document 11 |
| Catalog build script and `catalog.db` | FR-23, FR-30 |

**Exit condition:** the benchmark runs from the command line against at
least one free-tier model and one local model and produces the accuracy
table. This is the go/no-go for the photo-first concept: if calorie
accuracy is far from the target in document 01, the prompt and the choice
of recommended model are revisited before any more UI is built.

## Phase 1 — Manual tracker

| Work | Requirement |
| --- | --- |
| Database, migrations, repositories | NFR-08 |
| Onboarding: language, disclaimer, profile, goal | FR-01 to FR-04, FR-10 to FR-14 |
| Food search, recents, favorites, custom foods, portion entry | FR-30 to FR-33 |
| Today screen with totals, meals, day navigation | FR-40 to FR-42 |
| Rule-based insight | FR-50 |

**Exit condition:** the owner logs every meal manually for seven days using
only this app.

## Phase 2 — Photo scanning

| Work | Requirement |
| --- | --- |
| Provider settings, presets, secure key storage, "test connection" | FR-60 to FR-64 |
| Camera, gallery, preprocessing | FR-20, FR-21 |
| Analysis orchestration, matching, review and correction | FR-22 to FR-26 |
| Every failure branch | FR-27 |
| Photo retention setting | FR-28 |
| Barcode scanning with Open Food Facts (resolve open question Q3 first) | FR-34 |
| AI food suggestions | FR-51 |

**Exit condition:** the owner logs by photo for fourteen days; the review
screen needs no correction on a share of meals in line with the benchmark.

## Phase 3 — Hardening → 1.0

| Work | Requirement |
| --- | --- |
| Progress screen: weekly and monthly averages, weight log and chart, body measurements | FR-43 to FR-45 |
| Health Connect: write meals, read weight; published privacy policy | FR-74 |
| Export, import, delete all | FR-70 to FR-72 |
| Accessibility pass against the checklist | NFR-05 |
| Complete Spanish review by a native speaker | NFR-06 |
| End-to-end tests for the main flows; migration test | Document 11 |
| Legal texts in the app; About screen with licenses and data sources | Document 12 |
| Setup guides for at least one free provider and one local model | D3 |
| Signed release build and release checklist | Document 06 |

**Exit condition (definition of done for the MVP):**

- All requirements marked MVP in document 02 are implemented and their
  acceptance criteria pass.
- The release gates in document 11 pass.
- The owner has completed thirty consecutive days of use.
- A person who did not build the app installs it and completes the first
  scan in under five minutes using only the written guide.

## Phase 4 — Convenience (1.x)

Order is by value to the owner's daily use; each item can ship alone.

| Item | Requirement | Depends on |
| --- | --- | --- |
| Token usage and cost display | FR-65 | — |
| Queue scans while offline | FR-29 | — |
| Saved meals | FR-35 | — |
| Weekly summary | FR-52 | — |
| CSV export | FR-73 | — |
| Micronutrients against reference intakes | Document 02, section 3 | A cited source per region |

## Phase 5 — Reach (2.x)

| Item | Requirement | Depends on |
| --- | --- | --- |
| F-Droid | — | A build free of proprietary dependencies (Q3) |
| Resolve Android developer verification for sideloaded builds | — | Open question Q1 |
| iOS build and Apple Health | FR-75 | A contributor with a paid Apple account |
| Fallback provider | FR-66 | — |
| Optional self-hosted sync | FR-76 | A separate design document |
| More languages; regional food tables | — | Contributors; open question Q2 |

## Explicitly not planned

Accounts, a hosted AI proxy, social features, advertising, and paid tiers.

## Main risks

| Risk | Phase | Response |
| --- | --- | --- |
| Free-tier models are not accurate enough at portion estimation | 0 | Found early by the spike. Options: better prompting with scale references, the hint field, recommending a stronger model, setting expectations in the UI. |
| Catalog matching picks wrong foods (raw versus cooked, generic versus specific) | 0–2 | Measured separately in the benchmark; correction memory; translation and alias contributions. |
| Provider setup is too hard for non-developers | 2–3 | Guided presets; the five-minute test in the 1.0 exit condition. |
| Scope creep before 1.0 | All | Anything not marked MVP in document 02 waits. |
| Sideloading restrictions on Android | 5 | Q1; F-Droid and Play as fallbacks. |

## How this roadmap is tracked

Each phase becomes a milestone in the issue tracker, and each row becomes
one or more issues that cite the requirement id. A requirement changes in
document 02 first, then here.
