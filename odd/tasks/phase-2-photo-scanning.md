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

- [x] T1 — S1, S2, S3, S4, S10 — Provider profiles: presets data, secure key storage, settings screens, test connection, redirect-safe fetch — worker — commit: 393ac4c + 6f30e25
- [x] T2 — S4, S5, S6, S7, S8, S9, S11 — Scan flow: camera and gallery, preprocessing, analysis orchestration, matching, review, failure branches, photo retention — after T1 — commit: 3eb42b2

## Log

- **L1** — 2026-11-21 — Owner request, verbatim: «me voy al gym continua hasta finalizar todas las tareas.. yo te doy la autorizacion y aprobacion de lo que sea necesario..»
- **L2** — 2026-11-21 — T1 evidence: worker reported 46 suites / 848 tests, `tsc`, `expo lint`, and the Android export passing. Independent verification (Risk: item 2, security) found that `update` stored a new key before the profile row changed, so a failed or racing update could pair a key with the wrong host; plus stale "key saved" state, create-failure loose ends, stale test results, and a storage failure shown as "invalid key". All fixed test-first in the second commit, with a source guard against unwrapped `fetch`.
- **L3** — 2026-11-21 — Redirects: React Native's global `fetch` ignores the `redirect` option and follows redirects on Android; `expo/fetch` honours it. The app uses `expo/fetch` behind a wrapper that also refuses 3xx responses and changed origins. Not verified on a device: Keystore reads and writes, a live redirect refusal, backup behaviour with `allowBackup=false`. Screens were not looked at in a browser. Preset facts were verified on the providers' pages on 2026-11-21; Google labels `generateContent` as legacy but still supported.
- **L4** — 2026-11-21 — T2 evidence: 53 suites / 977 tests, `tsc`, `expo lint`, and the Android export pass; development-only code (fake provider, sample photo) is absent from the release bundle. Seen in the browser preview at 390 × 844 with a fake provider, dark theme (`impl-scan-*` screenshots); Spanish viewed only for review, analyzing, and the quota error. Differences from the artboard: the review photo is a strip under a top bar instead of full-bleed, and some error screens add "Try again". Android permissions requested: CAMERA, INTERNET. Not verified on a device: camera, flash, permission prompts, photo picker, downscaling and EXIF removal, file keep and delete, hardware back, the merged manifest, matching quality with FTS5. Not built: "save photo for later" (Next) and the raw-response debug view.
