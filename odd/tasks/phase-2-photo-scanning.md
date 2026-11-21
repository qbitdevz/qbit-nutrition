# Phase 2 — Photo scanning

Makes the core promise work end to end: connect an AI provider inside the app, photograph a plate, review and correct what was detected, and save it. Implements phase 2 of `docs/10-mvp-roadmap.md`.
Traceability: `bcdd/contrato.md` v4 (aprobado) — REQ-01, REQ-02, REQ-03, REQ-09, RN-02, RN-04, RN-05, RN-06, RN-12, RN-15. Branch `feat/phase-2-photo-scanning`, stacked on `feat/phase-1-manual-tracker`.

## Specs

- **S1** — REQ-09, listo cuando: «Se carga el servicio, la clave y el modelo, y una prueba indica si funciona o por qué no». Detail: `docs/02-prd.md` FR-60 to FR-64; flow E of `docs/04-information-architecture-and-user-flows.md`.
- **S2** — RN-02: «Cada persona usa el servicio y el modelo de IA que elija, con su propia cuenta, y lo configura dentro de la aplicación. No hay un servicio fijo.» Presets are data, not code (`docs/07-ai-pipeline.md` section 3); the model field is always editable.
- **S3** — RN-12: «La clave del servicio de IA nunca se incluye en lo que la persona exporta ni se muestra después de guardarla.» Storage and rules per `docs/06-system-architecture.md` section 6 (Security) and NFR-04.
- **S4** — RN-04: «Del teléfono solo sale lo que la persona decide enviar: la foto hacia el servicio de IA que eligió y los archivos que exporta. Antes del primer envío se le avisa a dónde va.» Transparency moments per `docs/12-legal-and-privacy.md` section 4.
- **S5** — REQ-01, listo cuando: «Con un servicio de IA conectado, la foto de un plato muestra los alimentos detectados con sus gramos y calorías, y al guardar se suman al día». Pipeline per `docs/07-ai-pipeline.md` section 2; flow B of `docs/04`.
- **S6** — REQ-02, listo cuando: «Se puede cambiar una cantidad, reemplazar, quitar o agregar un alimento, y los totales cambian sin volver a analizar la foto». Correction table of flow B.
- **S7** — RN-05: «La IA reconoce los alimentos y estima las cantidades; los valores nutricionales salen de una base de alimentos. Cuando un alimento no está en la base, su valor se muestra marcado como estimación de la IA.»
- **S8** — `docs/02-prd.md` FR-27: "Every failure has a specific message and a way forward: no provider configured, no network, invalid key, quota exceeded, unreadable response, no food detected. Manual entry is always offered." Flow C of `docs/04`.
- **S9** — `docs/02-prd.md` FR-28: "The user chooses whether photos are kept on the device after saving. The default keeps a compressed copy."
- **S10** — Phase 0 log L4: the platform layer must supply a fetch that does not follow redirects before real keys are used on a device.
- **S11** — RN-15: the scan screens follow `design/system.md` and the Review, Analyzing, and Scan error screens of `design/qbit-nutrition-app/01-orbit.html`.

## Tasks

- [ ] T1 — S1, S2, S3, S4, S10 — Provider profiles: presets data, secure key storage, settings screens, test connection, redirect-safe fetch — worker — commit:
- [ ] T2 — S4, S5, S6, S7, S8, S9, S11 — Scan flow: camera and gallery, preprocessing, analysis orchestration, matching, review, failure branches, photo retention — after T1 — commit:

## Log

- **L1** — 2026-11-21 — Owner request, verbatim: «me voy al gym continua hasta finalizar todas las tareas.. yo te doy la autorizacion y aprobacion de lo que sea necesario..»
