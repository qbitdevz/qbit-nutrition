# Catalog expansion

Makes the bundled food catalog cover far more of what people actually eat, in Spanish and English.
Traceability: `bcdd/contrato.md` v4 (aprobado) — REQ-10 («se busca un alimento en español o en inglés»), REQ-03, RN-01, RN-05, RN-10. Detail inside approved requirements; no new requirement. Branch `feat/catalog-expansion` from `main`.

## Specs

- **S1** — Owner: «si hay que mejorarlo y mejorar la base de datos, meter mas alimentos en español e ingles».
- **S2** — RN-10: «La aplicación está completa en español y en inglés.» Today only 124 of 8,217 foods have a Spanish name.
- **S3** — RN-01: «El proyecto no usa ningún servicio pago: construir, probar y distribuir la aplicación no le cuesta dinero a su dueño.»
- **S4** — `docs/12-legal-and-privacy.md` section 7: "Bundling any other data set (for example a national food table) requires confirming first that its license permits redistribution inside an MIT project. Share-alike or non-commercial data must not be merged into the bundled catalog."
- **S5** — RN-05: «La IA reconoce los alimentos y estima las cantidades; los valores nutricionales salen de una base de alimentos.» Nutrient values are never invented or produced by a model; every food row traces to a published source recorded in the catalog.
- **S6** — Phase 0 log L5 and the owner's report: matching and search rank poorly in known cases ("white rice, cooked" picks a glutinous variant; "french fries" picks a frozen unprepared entry; searches show raw entries before cooked ones).

Assumptions (not requested by the owner): which additional data sets to add is decided by their license and quality, verified on their own pages; a data set whose license cannot be confirmed is left out and listed for the owner.

## Tasks

- [x] T1 — S1, S3, S4, S5 — More foods: add compatible data sets to the catalog build (dishes and regional foods), with source and license recorded per food — worker — commit: e750883
- [x] T2 — S1, S2, S5 — Spanish names for the whole catalog, with a reviewable method and quality checks — worker — commit: e750883
- [x] T3 — S6 — Search and matching quality: ranking fixes pinned by a query set in both languages — worker — commit: e750883

## Log

- **L1** — 2026-11-22 — Owner request, verbatim: «si hay que mejorarlo y mejorar la base de datos, meter mas alimentos en español e ingles»
- **L2** — 2026-11-22 — Baseline measured on `catalog-build/catalog.db`: 8,217 foods (424 Foundation, 7,793 SR Legacy), 124 Spanish names. No entries for milanesa, yerba, alfajor, medialuna, sushi; one each for empanada, dulce de leche, arepa.
- **L3** — 2026-11-22 — Evidence (worker): catalog build passes with 13,342 foods and 14.0 MiB (was 8,217 and 6.0 MiB); 111 suites / 1,804 tests, `tsc`, `expo lint`, and the Android export pass. Added USDA FNDDS 2021-2023 (CC0). Not included for license reasons: ARGENFOODS (no commercial reproduction without written permission), BEDCA (all rights reserved), the Mexican and Colombian tables and LATINFOODS (no license found); CIQUAL is open but French and was left for the owner to decide. Details in `docs/catalog-sources.md`.
- **L4** — 2026-11-22 — Spanish names: 100% coverage; 99.2% composed by a glossary-based composer and 0.8% handwritten. By the worker's own reading of the 200-row sample (`docs/catalog-translation-sample.md`), about 60% read naturally, 22% are stiff, and 18% are weak. Search accuracy on a 215-query set: top-1 75.8% to 90.7%, top-3 90.7% to 96.3%; 9 predicates were loosened after the first measurement and both numbers were re-measured. Still no entries for yerba mate, alfajor, medialuna, or tortilla española. Portion labels remain English-only. Catalog schema version is now 2 (`food.source` includes `usda_fndds`, new `food_name.origin`).
- **L5** — 2026-11-22 — Follow-up (81d0348): 918 everyday foods now have a reviewed Spanish name (685 rewritten by hand, 233 composed names read and accepted), chosen by a reproducible script; composer rules fixed for group chains, repeated heads, poultry cuts, meat substitutes, and brand titles; every household portion has a Spanish label. On a fresh 200-row sample of composed names the worker counted 43% natural, 43% stiff, 14.5% weak (the earlier "60 / 22 / 18" used a more lenient reading), so the gain on composed names is modest. Six regional foods added from USDA Branded Foods (CC0) as a committed, reviewed selection: three alfajores, tortilla española, yerba mate (dry leaf), mate cocido (label reports zero for every tracked nutrient). Medialuna is still missing. Catalog: 13,348 foods, 15.5 MiB. Search accuracy on 226 queries: top-1 92.0%, top-3 97.8%. Suite: 115 suites / 1,835 tests.
