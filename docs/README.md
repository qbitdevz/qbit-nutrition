# Qbit Nutrition — Project Documentation

Qbit Nutrition is an open-source, local-first mobile app that
turns a photo of a meal into a nutrition log entry. The user brings their own
AI provider and key; no server is operated by the project.

Read the documents in order. Each one builds on the previous.

| # | Document | Answers |
| --- | --- | --- |
| 01 | [Product Vision](01-product-vision.md) | What are we building, for whom, and why is it different? |
| 02 | [Product Requirements (PRD)](02-prd.md) | Which features, user stories, and acceptance criteria? |
| 03 | [Sustainability and Cost Model](03-sustainability-and-costs.md) | Who pays for what, and how does the project stay at zero cost? |
| 04 | [Information Architecture and User Flows](04-information-architecture-and-user-flows.md) | How does the user move through the app? |
| 05 | [Design System](05-design-system.md) | How does it look and feel? |
| 06 | [System Architecture](06-system-architecture.md) | Which stack, which modules, and why? |
| 07 | [AI Vision and Nutrition Engine](07-ai-pipeline.md) | How does a photo become nutrients? |
| 08 | [Database Schema](08-database-schema.md) | What is stored on the device? |
| 09 | [Interfaces and Integrations](09-interfaces-and-integrations.md) | Which internal contracts and external services? |
| 10 | [MVP Roadmap](10-mvp-roadmap.md) | What ships first, and what waits? |
| 11 | [QA and AI Accuracy Plan](11-qa-and-ai-accuracy.md) | How do we know it works and how accurate it is? |
| 12 | [Legal and Privacy](12-legal-and-privacy.md) | Which disclaimers, policies, and licenses apply? |

## Decisions already made

These were decided by the project owner on 2026-11-21. Changing one means
revisiting every document that cites it.

| ID | Decision | Consequence |
| --- | --- | --- |
| D1 | Personal use first, then shared as open source | No monetization; the "monetization" document became a sustainability and cost model. |
| D2 | AI is provider-agnostic and model-agnostic, configured entirely inside the app | Bring-your-own-key (BYOK); no model or provider is hardcoded. |
| D3 | Free tier first | The default setup path must work without anyone being billed. |
| D4 | Bilingual from the start (English and Spanish) | All UI strings and food names are localized. |
| D5 | Local-first, no backend | All data lives on the device; the "API" document describes module contracts and third-party services, not our own server. |
| D6 | Android first, iOS documented | The code stays cross-platform; iOS builds wait for someone with a paid Apple account. |
| D7 | MIT license | Constrains which data sets and libraries may be bundled (see document 12). |
| D8 | Documentation in English | Repository-facing text is English; the app itself is bilingual. |
| D10 | Body measurements, Health Connect, AI food suggestions, and barcode scanning are part of 1.0 | Owner decision recorded in `bcdd/contrato.md` (REQ-15 to REQ-18). |
| D9 | React Native + Expo + TypeScript | Chosen in document 06 after comparing Flutter, Kotlin Multiplatform, Rust, and Go. |

## Facts checked against live sources (2026-11-21)

Prices, limits, and versions change. Re-check before relying on any of them.

| Fact | Source |
| --- | --- |
| USDA FoodData Central data is public domain (CC0 1.0); the API needs a free data.gov key and allows 1,000 requests per hour per IP. `DEMO_KEY` allows 30 per hour and 50 per day. | <https://fdc.nal.usda.gov/api-guide> |
| Open Food Facts: database under ODbL, contents under the Database Contents License, images under CC BY-SA. Limits: 15 product reads per minute and 10 searches per minute, per user for mobile apps. Data accuracy is not guaranteed. | <https://openfoodfacts.github.io/openfoodfacts-server/api/> |
| The Gemini API has a free tier for some models; free-tier content is used to improve Google products. Exact free limits are shown per project in AI Studio, not in a fixed public table. | <https://ai.google.dev/gemini-api/docs/pricing> |
| Google Fit APIs are supported only until the end of 2026; Health Connect is the path for mobile-first Android apps. | <https://developer.android.com/health-and-fitness/health-connect/migration/fit> |
| Android developer verification started on 2026-09-30 in Brazil, Indonesia, Singapore, and Thailand, and expands globally in 2027 on certified devices. It also covers apps distributed outside Google Play. | <https://developer.android.com/developer-verification> |
| Google Play charges a one-time US$25 registration fee. | <https://support.google.com/googleplay/android-developer/answer/6112435> |
| Without a paid Apple Developer Program membership, apps installed from Xcode expire after 7 days and are limited to 3 devices. | <https://developer.apple.com/support/compare-memberships/> |
| F-Droid applies the "Tethered Network Services" anti-feature unless a simple option lets the user point the app at an alternative, self-hostable server. | <https://f-droid.org/docs/Anti-Features/> |

From secondary sources only (not confirmed on a primary page):

- Current stable lines are Flutter 3.47, React Native 0.88, Expo SDK 58, and
  Compose Multiplatform 1.12. Pin whatever is stable on the day the project is
  created.
- Gemini 3.8 Flash and Gemini 3.5 Flash-Lite are on the free tier.
- OpenRouter free models allow 50 requests per day, or 1,000 per day after a
  one-time purchase of 10 credits.

## Status of these documents

Documents 01 to 12 were written before any code. Where the code went a
different way, the feature documents under `odd/tasks/` record what was built
and why, and they take precedence:

- Document 05: its visual direction was replaced by the Orbit direction in
  `design/` (contract rule RN-15); only its sections 8 and 9 still apply.
- Document 10: body measurements, barcode scanning, AI suggestions, and Health
  Connect were moved into the first version by the owner.
- Documents 06 to 09: details such as the Anthropic and Gemini structured
  output modes, the catalog as a separate read-only connection, fresh ids for
  imported provider profiles, and `expo/fetch` behind a redirect-refusing
  wrapper are described in the feature documents.

## Open questions

| # | Question | Blocks |
| --- | --- | --- |
| Q1 | What does Android developer verification require, and cost, for an app distributed only through GitHub Releases or F-Droid? | Public distribution (document 10, phase 5) |
| Q2 | Does the BEDCA Spanish food database have a license that allows bundling in an MIT project? | Spanish-specific food data (document 07) |
| Q3 | **Answered 2026-11-21:** yes. `expo-camera` on Android depends on Google ML Kit and Play services libraries, so an F-Droid build is not possible as is. Typed barcode entry needs none of them; an F-Droid flavor would have to build the camera module from source with the scanners off and use another decoder. | F-Droid distribution (document 10, phase 5) |
| Q4 | Which public food-photo data set, if any, has a license that allows use in the accuracy benchmark? | Benchmark breadth (document 11) |
| Q5 | Copyright holder for the MIT `LICENSE` file. The product name is settled: Qbit Nutrition. | First public release |
