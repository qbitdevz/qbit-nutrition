# Release 1.0 — closing open details

Closes the known gaps recorded in the feature documents before the first public release.
Traceability: internal technical work and fixes inside approved requirements (`bcdd/contrato.md` v7: REQ-02, REQ-06, REQ-12, REQ-16, RN-12, RN-15); no new requirement. Branch `chore/release-1.0` from `main`.

## Specs

- **S1** — Owner: «creo que ya podriamos subirla con el tag 1.0. pero tendriamos que cerrar todo lo pendiente y detalles».
- **S2** — Review finding R4-001 (`.github/workflows/release.yml`, signature check): "a signed build whose output lacks a recognisable certificate line passes the step with only the raw output logged." A signed build must be accepted only when the APK carries the expected release certificate.
- **S3** — Review finding R4-release-create-not-retry-safe: "Creating the release as a draft and publishing it only after the assets are attached would make the step retry-safe."
- **S4** — Phase 1 log L7: "item delete uses a confirmation instead of undo". `docs/04-information-architecture-and-user-flows.md`, correction table: "Item removed, with a 5-second undo".
- **S5** — Phase 2 log L4: "the review photo is a strip under a top bar instead of full-bleed". The Review screen of `design/qbit-nutrition-app/01-orbit.html` is the spec (RN-15).
- **S6** — Phase 3 log L5: "the privacy link in Health Connect's permission screen opens the app's home screen". It must open the privacy policy.
- **S7** — Review finding R3-usage-partial-sum (`src/core/ai/pipeline.ts`): a repaired scan can report the tokens of one call alone as the total "without any indication it is partial".
- **S8** — The app reports version 1.0.0 everywhere it shows or uses a version, and the documentation describes the app as it is.

## Tasks

- [ ] T1 — S2, S3 — Release workflow: expected-certificate check, draft-then-publish — worker — commit:
- [ ] T2 — S4, S5, S6, S7 — App details: item undo, full-bleed review photo, privacy link target, partial token usage — worker — commit:
- [ ] T3 — S8 — Version 1.0.0, changelog, README and docs status — commit:
- [ ] T4 — Third independent verification of data export, import, and delete (Risk: item 1) — verify — evidence:

## Log

- **L1** — 2026-11-22 — Owner, verbatim: «ya einstale la apk configure con openrouter y funciona bien.. lo que si no se si las calorias que calcula estan correctas o son precisas... ahora voy a hacer la importacion de las listas. creo que ya podriamos subirla con el tag 1.0. pero tendriamos que cerrar todo lo pendiente y detalles». First run on a real Android phone: installed, provider configured through OpenRouter, reported as working. Accuracy is still unmeasured (phase 0 T6): REQ-14's threshold is not shown to be met.
