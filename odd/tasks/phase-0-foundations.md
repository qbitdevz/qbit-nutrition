# Phase 0 — Foundations and AI spike

Builds the repository, the empty app, and the AI pipeline core with its
accuracy benchmark. Implements phase 0 of `docs/10-mvp-roadmap.md`.
Traceability: `bcdd/contrato.md` v3 (aprobado) — REQ-01, REQ-09, REQ-14, RN-01, RN-02, RN-05. T1 and T2 are internal technical work (exempt).

## Specs

- **S1** — Owner: «si arranca pero subir al repositorio de "qbitdevz" como publico». The repository is public under the GitHub account `qbitdevz`.
- **S2** — RN-01: «El proyecto no usa ningún servicio pago: construir, probar y distribuir la aplicación no le cuesta dinero a su dueño.»
- **S3** — Roadmap: "Expo project, navigation shell, design tokens, English and Spanish scaffolding". Stack and module layout per `docs/06-system-architecture.md` sections 3 and 4; tokens per `docs/05-design-system.md` sections 2 to 4.
- **S4** — Roadmap: "`core/ai` in plain TypeScript: schema, prompt v1, the three adapters". Contracts per `docs/07-ai-pipeline.md` sections 2 to 5 and 9, and `docs/09-interfaces-and-integrations.md` sections 1.1, 1.2, and 2.2 to 2.5.
- **S5** — RN-02: «Cada persona usa el servicio y el modelo de IA que elija, con su propia cuenta, y lo configura dentro de la aplicación. No hay un servicio fijo.» No provider or model identifier is hardcoded as a default in code.
- **S6** — RN-05: «La IA reconoce los alimentos y estima las cantidades; los valores nutricionales salen de una base de alimentos. Cuando un alimento no está en la base, su valor se muestra marcado como estimación de la IA.»
- **S7** — Roadmap: "Catalog build script and `catalog.db`". Sources and matching per `docs/07-ai-pipeline.md` section 6; tables per `docs/08-database-schema.md` section 5; tracked nutrients per `docs/02-prd.md` section 3. Only USDA Foundation Foods and SR Legacy (CC0) are bundled.
- **S8** — REQ-14: «Hay un conjunto de comidas pesadas en balanza y un informe con el error de calorías de cada modelo probado; con el modelo recomendado, al menos 6 de cada 10 comidas tienen un error de calorías menor al 20 %». Harness per `docs/11-qa-and-ai-accuracy.md` sections B.1 to B.4.
- **S9** — `core` imports nothing from React, Expo, or `data` (`docs/06-system-architecture.md` section 4), so tests and the benchmark run in plain Node.
- **S10** — No test calls a real AI provider (`docs/11-qa-and-ai-accuracy.md` section A.1).

Assumptions (not requested by the owner): LICENSE copyright line reads "Qbit Nutrition contributors" until P-04 is answered; commits use the `qbitdevz` GitHub noreply address.

## Tasks

- [x] T1 — S1, S2 — Repository bootstrap: git, license, README, contributing guide, public GitHub repository — inline — commit: fc8544c
- [x] T2 — S3, S9 — Expo project, navigation shell, design tokens, EN/ES scaffolding, test runner, CI — inline — commit: 78e2d0e
- [x] T3 — S4, S5, S6, S9, S10 — `src/core/ai`: schema, prompt v1, error taxonomy, three adapters, analyze pipeline with repair — worker — commit: 45874f2
- [x] T4 — S6, S7, S9 — Catalog build script, `src/core/catalog` search and matching, `src/core/nutrition` nutrient math — worker — commit: e7b4b5d
- [x] T5 — S8, S10 — Benchmark harness CLI and report — after T3 and T4 — commit: bad27a2
- [ ] T6 — S8 — First set of about 30 weighed meals and a real benchmark run — blocked: needs the owner's photos, weights, and provider keys

## Log

- **L1** — 2026-11-21 — Owner request, verbatim: «si arranca pero subir al repositorio de "qbitdevz" como publico» (answer to "¿arranco la fase 0? Es crear el repositorio git local, el proyecto base y la prueba que mide la precisión de la IA con fotos.").
- **L2** — 2026-11-21 — Evidence: T2 verified with `tsc`, `expo lint`, Jest, and an Android bundle export (`expo export --platform android`). T3 and T4 built by workers; full suite 9 suites / 215 tests at commit e7b4b5d.
- **L3** — 2026-11-21 — Independent verification of T3 (Risk: item 2, security) found that redirects carried the API key, a backslash and leading-zero bypass of the HTTPS rule, and redaction gaps. Fixed test-first in 997e018 (47 failing tests first, then 245 passing in `src/core/ai`).
- **L4** — 2026-11-21 — Open risk for phase 2: React Native's fetch may ignore `redirect: 'error'`. The platform layer must supply a fetch that does not follow redirects before real keys are used on a device. Plain HTTP hosts are judged by name, not by DNS resolution.
- **L5** — 2026-11-21 — Deviations from the docs, now reflected in docs/08 and docs/09: `food.is_branded` column and two catalog indexes; Anthropic native structured output; Gemini `responseJsonSchema` and its 400 `API_KEY_INVALID` error. Matching needs tuning against the benchmark ("white rice, cooked" picks a glutinous variant; "french fries" picks a frozen unprepared entry).
- **L6** — 2026-11-21 — Slice boundaries for review: T2 (78e2d0e), lock file (13ced3e), T3 with its fix (45874f2 + 997e018), T4 (e7b4b5d), T5 (bad27a2). History was reordered before the first push so the security fix follows T3.
- **L7** — 2026-11-21 — T5 evidence: full suite 12 suites / 340 tests, `tsc` and `expo lint` clean at bad27a2. The harness has only run against a fake provider and a fixture catalog; on the empty data set it stops with "No meals found". No image resizing: photos must be saved with the long edge at most 1,024 px. Phase 0 exit condition (a real run against a free-tier and a local model) is not met; it waits on T6.
- **L8** — 2026-11-21 — Native review, by slice (the whole branch exceeded the reviewer context budget): T2 approved (review-fe8016e9eb5409c8); lock file, T4, and T5 assessed as not due; T3 with its fix approved (review-95aaee86be29cac6). Non-blocking findings left as later work: CI actions pinned to major tags instead of commit SHAs; Jest has no mapping for the `@/` alias; the language choice is not persisted across restarts; `addUsage` in `src/core/ai/pipeline.ts` reports a partial token total when only one of the two calls of a repaired scan reports usage.
