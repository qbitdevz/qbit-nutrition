# Phase 1 — Manual tracker (core and data first)

Builds the offline nutrition log: target recommendation, local database, and the screens that use them. Implements phase 1 of `docs/10-mvp-roadmap.md`, starting with the parts every later phase depends on.
Traceability: `bcdd/contrato.md` v3 (aprobado) — REQ-04, REQ-05, REQ-06, REQ-08, REQ-10, RN-03, RN-08, RN-09, RN-13. Branch `feat/phase-1-manual-tracker`, stacked on `feat/phase-0-foundations`.

## Specs

- **S1** — RN-13: «Las calorías, proteínas, carbohidratos y demás nutrientes diarios se recomiendan a partir del peso, la altura y los demás datos de la persona que influyen: edad, sexo, nivel de actividad y objetivo.»
- **S2** — REQ-04, listo cuando: «Con peso, altura, edad, sexo y nivel de actividad cargados, al elegir un objetivo la aplicación propone calorías, proteínas, carbohidratos y grasas diarios, que la persona puede modificar». Method per `docs/02-prd.md` section 4.
- **S3** — RN-08: «No se proponen objetivos a menores de 18 años, ni durante el embarazo o la lactancia, ni por debajo de un mínimo diario de calorías. La persona puede ajustar ese mínimo desde la configuración.»
- **S4** — `docs/02-prd.md` section 4: "The specific constants (activity factors, deficit and surplus percentages, protein per kilogram, minimum energy) must each cite a published guideline in the code".
- **S5** — REQ-08, listo cuando: «El resumen del día muestra una sugerencia basada en lo consumido y el objetivo, por ejemplo cuánta proteína falta». Rules and order per `docs/07-ai-pipeline.md` section 7; wording rules per `docs/05-design-system.md` section 8.
- **S6** — RN-03: «Los datos de la persona quedan en su teléfono. El proyecto no tiene servidor ni cuentas de usuario.» Tables, conventions, snapshots, and migrations per `docs/08-database-schema.md` sections 2 to 4 and 6 to 8.
- **S7** — REQ-06, listo cuando: «Se puede abrir cualquier día anterior y modificar o borrar sus comidas».
- **S8** — REQ-10, listo cuando: «Sin conexión a internet, se busca un alimento en español o en inglés, se indica la cantidad y se guarda». RN-09: «Sin un servicio de IA conectado, la aplicación sigue sirviendo: se registra a mano y se consultan objetivos e historial.»
- **S9** — REQ-05, listo cuando: «Una pantalla muestra lo consumido, lo que queda según el objetivo y las comidas del día».
- **S10** — `core` imports nothing from React, Expo, or `data` (`docs/06-system-architecture.md` section 4). Screens never run SQL directly (`docs/09-interfaces-and-integrations.md` section 1.5).

Assumptions (not requested by the owner): the default minimum daily energy (RN-14) is still "A confirmar" in the contract; the code carries a proposed default with its cited source, to be approved by the owner before release.

## Tasks

- [x] T1 — S1, S2, S3, S4, S5, S10 — `src/core/nutrition`: `proposeTargets` and `pickInsight` with cited constants — worker — commit: ee563f6
- [x] T2 — S6, S7, S10 — `src/data`: schema, migrations, repositories; catalog database port for the app — worker — commit: f07533a
- [x] T3a — S9, S10 — UI foundation from `design/system.md` and `design/qbit-nutrition-app/01-orbit.html`: tokens, fonts, motion, components, app startup (database, catalog), Today screen — worker — commit: 5a8fc8f
- [x] T3b — S2, S3, S7, S8 — onboarding with target proposal, manual logging (search, portion, save), day history and meal editing, minimum-energy setting — after T3a — commit: fe140b0

## Log

- **L1** — 2026-11-21 — Owner request, verbatim: «dale entonces con todo, si necesitas parcharlo localmente hacelo pero neceisto que avancemos. tambien como estoy usando la suscripcion de fable necesito que te enfoques en las tareas mas complejas e importantes o fundamentales de la app ya que al ser modelo mas potente que opus vamos a tener mejores resultados»
- **L3** — 2026-11-21 — Owner correction, verbatim: «algo que no te dije es que necesito que el diseño sea morderno con animaciones, efectos, transiciones, botones redondeados y buena visual. buena UX/UI utilizando el branding de mi marca personal qbitdev». Recorded as RN-15 in the contract (v4). T3 waits for the owner to choose a design direction.
- **L4** — 2026-11-21 — Evidence: T1 and T2 built by workers; whole suite 22 suites / 475 tests, `tsc` and `expo lint` clean. Open for the owner: default minimum energy 1,200/1,500 kcal (DGA 2015–2020, superseded edition); gentle fat-loss pace of −10% has no published source; deficit, surplus, and protein values come from studies of athletes; insight thresholds are the team's choice. Not verified on a device: the Expo database wiring, FTS5 in the Android build, and time-zone formatting on Hermes. `drizzle-orm` is pinned to a release candidate (1.0.0-rc.6) because only that line has the Node driver the tests use.
- **L5** — 2026-11-21 — Design: `design/qbit-nutrition-app/` holds three directions: `01-orbit.html`, `02-ledger.html`, `03-bento.html`, with the proposed starter system in `design/system.md`. Owner, verbatim: «me voy al gym continua hasta finalizar todas las tareas.. yo te doy la autorizacion y aprobacion de lo que sea necesario..». The owner did not choose a direction; the team hands off `01-orbit.html` as a provisional choice (assumption, contract P-06) and the other two remain alternatives.
- **L2** — 2026-11-21 — Decision: phase 0 task T6 (weighed meals, real benchmark run) stays blocked on the owner's photos and keys; phase 1 does not depend on it.
- **L6** — 2026-11-21 — T3a evidence: 28 suites / 609 tests, `tsc`, `expo lint`, and `expo export --platform android` pass. Seen rendered only as a web preview at 390 × 844 (screenshots `design/qbit-nutrition-app/.screenshots/impl-*`); never run on an Android device or emulator (no SDK on this machine). `npm run web` needs cross-origin isolation headers the Expo CLI does not add to the HTML page, so it does not run on its own. Left for T3b: the no-targets notice has no action, meal rows are not pressable, the recovery screen has no export option.
- **L7** — 2026-11-21 — T3b evidence: 34 suites / 690 tests, `tsc`, `expo lint`, and `expo export --platform android` pass. The worker stopped once on a quota error and was resumed. Flow walked in a browser at 390 × 844 in English and Spanish, dark theme only (`impl-flow-*` screenshots, via `npm run preview`); never run on an Android device. Web preview search uses a dev-only LIKE fallback, so it does not show the real FTS5 ranking. Not done: re-asking the health notice when its version changes; item delete uses a confirmation instead of undo; meal undo re-saves under a new id. Not verifiable without a device: keyboard avoidance, hardware back, native FTS5, snackbar position, font scaling, opening source links.
- **L8** — 2026-11-22 — Owner, verbatim: «el orbit esta bien». The provisional choice of `design/qbit-nutrition-app/01-orbit.html` is confirmed; Ledger and Bento stay in `design/` as discarded alternatives.
