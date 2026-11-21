# 06 — System Architecture

## 1. Shape of the system

There is no backend (D5). The app is the whole system; it talks directly to
services the user chose.

```
┌─────────────────────────── Android device ───────────────────────────┐
│                                                                      │
│  UI (React Native screens, Expo Router)                              │
│        │                                                             │
│  Application layer (use cases: scan meal, log food, set goal, …)     │
│        │                                                             │
│  ┌─────┴──────────┬───────────────┬───────────────┬───────────────┐  │
│  │ Nutrition core │ AI gateway    │ Food catalog  │ Data access   │  │
│  │ (pure TS)      │ (adapters)    │ (search/match)│ (repositories)│  │
│  └────────────────┴──────┬────────┴───────┬───────┴───────┬───────┘  │
│                          │                │               │          │
│                   Secure storage     SQLite (app DB + bundled        │
│                   (API keys)         catalog) · photo files          │
└──────────────────────────┼────────────────┼──────────────────────────┘
                           │ HTTPS          │ HTTPS (only when triggered)
                 ┌─────────┴────────┐  ┌────┴─────────────┐
                 │ User's AI        │  │ Open Food Facts  │   Health Connect
                 │ provider or      │  │ (barcode, Next)  │   (on device)
                 │ local model      │  └──────────────────┘
                 └──────────────────┘
```

## 2. Stack decision

### Requirements that drive the choice

1. Camera, local SQLite with full-text search, hardware-backed secret
   storage, and Health Connect on Android.
2. Android now, iOS later from the same code (D6).
3. Zero-cost toolchain and releases (D3).
4. A large contributor pool, because the project goes open source (D1).
5. Calling several LLM HTTP APIs and validating structured JSON.
6. A solo developer assisted by AI coding agents.

### Options compared

| Option | Fit | Assessment |
| --- | --- | --- |
| **TypeScript: React Native + Expo** | Strong | Native components, first-party modules for camera, SQLite, secure storage, file system, and localization. Largest contributor pool. Excellent schema-validation and LLM tooling in TypeScript. Fastest route from zero to an installable APK. Weaker point: F-Droid builds need care with proprietary dependencies. |
| **Flutter (Dart)** | Strong | The most polished single toolchain, and many F-Droid apps use it. Draws its own UI, which suits heavily custom visuals more than this plain, form-and-list app. Smaller contributor pool; Dart is one more language for contributors to learn. |
| **Kotlin Multiplatform + Compose** | Medium | Best native feel and the natural home of Health Connect. iOS support for shared UI is newer, the tooling is heavier, and the contributor pool is the smallest of the three. |
| **Rust (Tauri mobile, Dioxus)** | Weak | Rust is valuable for compute-heavy or security-critical cores; this app has neither. Mobile UI support is the least mature, and camera, Health Connect, and secure storage would need custom native plugins. |
| **Go (gomobile, Fyne)** | Weak | Go is excellent for servers, and this system has none. Its mobile UI options are not suited to a consumer app. |

Rust and Go are strong backend languages. With no backend, their main
advantage does not apply here. If the optional sync server (FR-76) is ever
built, Go is a reasonable choice for it, independently of the app.

### Decision (D9)

**React Native with Expo, in TypeScript.**

It meets all six requirements, and it wins on the two that separate it from
Flutter for this project: contributor reach and the TypeScript ecosystem for
LLM integration and validation. Flutter is the runner-up and a sound
alternative.

Reconsider the decision if open question Q3 shows that a clean F-Droid build
is impractical with Expo modules. That is the one area where Flutter has a
clear edge.

## 3. Technology choices

Versions are pinned to the current stable release on the day the project is
created (README lists what was current on 2026-11-21).

| Concern | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode | Type safety across UI, domain, and provider adapters |
| Framework | React Native with Expo, development builds | Native modules without maintaining native projects by hand |
| Navigation | Expo Router | File-based routes, typed links |
| Database | SQLite through `expo-sqlite` | Local, transactional, supports FTS5 full-text search |
| Queries and migrations | Drizzle ORM | Typed schema, SQL migrations checked into the repository |
| Secrets | `expo-secure-store` | Backed by the Android Keystore |
| Camera and images | `expo-camera`, `expo-image-picker`, `expo-image-manipulator` | Capture, gallery, downscale, and re-encode (strips metadata) |
| Files | `expo-file-system`, `expo-sharing`, `expo-document-picker` | Photos, export, import |
| Validation | Zod | One schema validates model output and generates the JSON Schema sent to providers |
| State | Zustand for UI state; database queries as the source of truth | Small, no boilerplate |
| Localization | `i18next` with `expo-localization` | Mature, pluralization, device locale |
| Charts | Chosen at implementation of the Progress screen | Must render with the tokens in document 05 and be MIT-compatible |
| Health data | A Health Connect binding for React Native | Evaluate maintenance and license when that phase starts |
| Unit tests | Jest | Standard for the ecosystem |
| Component tests | React Native Testing Library | Tests behavior through the accessible tree |
| End-to-end tests | Maestro | Open source, runs on a local emulator at no cost |
| Lint and format | ESLint and Prettier | Standard |
| CI and releases | GitHub Actions; local Gradle builds as fallback | Free for a public repository |

No analytics, crash-reporting, or advertising SDK is allowed (NFR-03).

## 4. Module layout

```
src/
├── app/                 Expo Router screens (UI only)
├── features/            One folder per use-case group
│   ├── scan/            capture, analysis orchestration, review state
│   ├── log/             manual logging, recents, favorites
│   ├── goals/           profile, targets
│   ├── progress/        aggregates, weight
│   └── settings/        providers, data, language
├── core/                Pure TypeScript, no React, no Expo imports
│   ├── nutrition/       nutrient math, targets, unit conversion, insights
│   ├── ai/              provider interface, adapters, prompt, schema
│   └── catalog/         search, matching, ranking
├── data/                Drizzle schema, migrations, repositories
├── platform/            Thin wrappers: secure store, files, camera, health
├── i18n/                en.json, es.json
└── ui/                  Design-system components and tokens
```

Dependency rule: `app → features → core`, and `features → data` and
`features → platform`. **`core` imports nothing from React, Expo, or
`data`.** That keeps the nutrition math and the AI pipeline runnable in
plain Node, which is what the accuracy benchmark (document 11) and unit
tests use.

## 5. Main runtime sequence: scan a meal

```
User        UI/scan        platform         core/ai           Provider      core/catalog     data
 │ shutter    │               │                │                  │              │             │
 │──────────▶│ downscale ───▶│                │                  │              │             │
 │            │◀── JPEG ─────│                │                  │              │             │
 │            │ analyze(image, hint, locale) ▶│                  │              │             │
 │            │               │ read key ◀────│                  │              │             │
 │            │               │                │── HTTPS ───────▶│              │             │
 │            │               │                │◀─ JSON ─────────│              │             │
 │            │               │                │ validate (Zod); one repair retry             │
 │            │◀── detected items ────────────│                  │              │             │
 │            │ match(items) ─────────────────────────────────────────────────▶│             │
 │            │◀── catalog foods + nutrients ─────────────────────────────────│             │
 │◀─ Review ──│               │                │                  │              │             │
 │ edit, save │               │                │                  │              │             │
 │──────────▶│ saveMeal (one transaction) ───────────────────────────────────────────────────▶│
```

## 6. Cross-cutting concerns

**Security**

- API keys live only in secure storage, keyed by provider profile id. The
  database stores the profile without the key.
- Keys are sent only to the base URL of their own profile. Changing a
  profile's base URL clears its key.
- Plain HTTP is allowed only for private-network and loopback addresses
  (local models). Everything else requires HTTPS.
- Logs never contain keys, request bodies, or photos. A debug screen shows
  redacted request metadata only.
- Model output is untrusted input: it is validated against a schema, never
  rendered as markup, and never used to build SQL.
- The Android backup configuration excludes the database and photos from
  automatic cloud backup; the user's own export is the backup path.

**Offline behavior.** The database and catalog are local. Network is used
only for AI analysis, model listing, and barcode lookup. Each of those
fails with a specific message (document 04, flow C).

**Errors.** One typed error taxonomy for provider failures (document 09)
maps to the user messages. Unknown errors are shown with a copyable,
redacted detail block for bug reports.

**Localization.** UI strings are in `i18n/`. Food names are localized in
the catalog (document 08). The model is told the user's locale and returns
display names in it.

**Performance.** Catalog search uses an FTS5 index. Daily totals are
computed from stored per-item nutrient snapshots, so no joins against the
catalog are needed to draw the dashboard.

## 7. Build and distribution

| Stage | How | Cost |
| --- | --- | --- |
| Development | Expo development build on a device or emulator | Free |
| CI | Type check, lint, unit and component tests on every pull request | Free |
| Release | Tag → GitHub Actions builds a signed release APK → attached to a GitHub Release | Free |
| Signing key | Generated once, stored as an encrypted repository secret and backed up offline by the owner | Free |
| F-Droid | Build variant with no proprietary dependencies, submitted after 1.0 | Free |
| iOS | `expo prebuild` and Xcode by a contributor with a paid account | Not planned |

Losing the signing key means users cannot update in place. Backing it up is
part of the first release checklist.

## 8. Architecture decision records

Significant decisions after this document are recorded as short files under
`docs/adr/` with context, decision, and consequences. D1 to D9 in the README
are the starting set.
