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

- [ ] T1 — S1, S2, S3, S4, S5, S10 — `src/core/nutrition`: `proposeTargets` and `pickInsight` with cited constants — worker — commit:
- [ ] T2 — S6, S7, S10 — `src/data`: schema, migrations, repositories; catalog database port for the app — worker — commit:
- [ ] T3 — S2, S3, S8, S9 — `src/features` use cases and screens: onboarding, food search and portion entry, Today — after T1 and T2 — commit:

## Log

- **L1** — 2026-11-21 — Owner request, verbatim: «dale entonces con todo, si necesitas parcharlo localmente hacelo pero neceisto que avancemos. tambien como estoy usando la suscripcion de fable necesito que te enfoques en las tareas mas complejas e importantes o fundamentales de la app ya que al ser modelo mas potente que opus vamos a tener mejores resultados»
- **L2** — 2026-11-21 — Decision: phase 0 task T6 (weighed meals, real benchmark run) stays blocked on the owner's photos and keys; phase 1 does not depend on it.
