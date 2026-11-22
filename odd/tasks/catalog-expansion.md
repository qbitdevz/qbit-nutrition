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

- [ ] T1 — S1, S3, S4, S5 — More foods: add compatible data sets to the catalog build (dishes and regional foods), with source and license recorded per food — worker — commit:
- [ ] T2 — S1, S2, S5 — Spanish names for the whole catalog, with a reviewable method and quality checks — worker — commit:
- [ ] T3 — S6 — Search and matching quality: ranking fixes pinned by a query set in both languages — worker — commit:

## Log

- **L1** — 2026-11-22 — Owner request, verbatim: «si hay que mejorarlo y mejorar la base de datos, meter mas alimentos en español e ingles»
- **L2** — 2026-11-22 — Baseline measured on `catalog-build/catalog.db`: 8,217 foods (424 Foundation, 7,793 SR Legacy), 124 Spanish names. No entries for milanesa, yerba, alfajor, medialuna, sushi; one each for empanada, dulce de leche, arepa.
