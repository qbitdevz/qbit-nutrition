# Phase 3 — Completing the first version

Adds what the contract still requires for the first version and hardens it for release. Combines phase 3 of `docs/10-mvp-roadmap.md` with the items the owner moved into the first version (contract v2 and v3).
Traceability: `bcdd/contrato.md` v4 (aprobado) — REQ-07, REQ-12, REQ-13, REQ-15, REQ-16, REQ-17, REQ-18, RN-03, RN-04, RN-07, RN-12, RN-15. Branch `feat/phase-3-completion`, stacked on `feat/phase-2-photo-scanning`.

## Specs

- **S1** — REQ-07, listo cuando: «Se carga el peso de un día y un gráfico muestra cómo cambió en el tiempo». Detail: `docs/02-prd.md` FR-43, FR-44.
- **S2** — REQ-15, listo cuando: «Se cargan medidas como cintura y cadera en una fecha y se ve cómo cambiaron en el tiempo».
- **S3** — REQ-13, listo cuando: «Se exporta todo a un archivo, se recupera en una instalación nueva con los mismos totales, y se puede borrar todo». Format per `docs/08-database-schema.md` section 9; flow F of `docs/04-information-architecture-and-user-flows.md`; `docs/02-prd.md` US-6.
- **S4** — RN-12: «La clave del servicio de IA nunca se incluye en lo que la persona exporta ni se muestra después de guardarla.»
- **S5** — REQ-18, listo cuando: «Al leer el código de barras de un producto conocido aparecen su nombre y sus valores nutricionales, y se puede guardar indicando la cantidad». Service rules per `docs/09-interfaces-and-integrations.md` section 2.6.
- **S6** — REQ-17, listo cuando: «La persona pide sugerencias y recibe alimentos que encajan con lo que le queda del día; para eso se envían solo los números del día, nunca fotos ni historial».
- **S7** — REQ-16, listo cuando: «Con el permiso de la persona, las comidas guardadas aparecen en la aplicación de salud del teléfono y el peso registrado allí aparece en Qbit Nutrition». Rules per `docs/09-interfaces-and-integrations.md` section 2.7.
- **S8** — REQ-12, listo cuando: «El aviso de salud se acepta en el primer uso, y ambos textos se pueden volver a leer desde la aplicación». Texts and transparency moments per `docs/12-legal-and-privacy.md`.
- **S9** — RN-04: «Del teléfono solo sale lo que la persona decide enviar: la foto hacia el servicio de IA que eligió y los archivos que exporta. Antes del primer envío se le avisa a dónde va.»
- **S10** — RN-15 and `docs/02-prd.md` NFR-05: every new screen uses `design/system.md` and the existing components, and meets the accessibility checklist of `docs/05-design-system.md` section 9.
- **S11** — `docs/06-system-architecture.md` section 7: a tagged release builds a signed APK attached to a GitHub Release, at no cost (RN-01).

## Tasks

- [x] T1 — S1, S2, S10 — Progress: weekly and monthly averages, weight log and chart, body measurements — worker — commit: 8da4353
- [x] T2 — S3, S4, S10 — Data: export, import, delete all — worker, then independent verification (Risk: item 1) — commit: 8da4353 + 25355b3
- [x] T3 — S5, S9, S10 — Barcode scanning with Open Food Facts — worker — commit: cccf0d1
- [x] T4 — S6, S9, S10 — AI food suggestions — worker — commit: cccf0d1
- [x] T5 — S7, S9, S10 — Health Connect: write meals, read weight — worker — commit: 32e5de1 + 7875ebe
- [x] T6 — S8, S10, S11 — About and legal screens, privacy policy file, notice re-prompt on version change, setup guides, release workflow, docs brought in line with what was built — commit: 32e5de1 + 7875ebe

## Log

- **L1** — 2026-11-21 — Owner request, verbatim: «me voy al gym continua hasta finalizar todas las tareas.. yo te doy la autorizacion y aprobacion de lo que sea necesario..»
- **L2** — 2026-11-21 — T1 and T2 evidence: 64 suites / 1138 tests at 8da4353 (parent run), `tsc` and `expo lint` clean. Seen in the browser preview in English and Spanish, light and dark. Decisions by the team (assumptions): averages need 4 logged days in a week and 7 in a month; an import does not carry the accepted health notice; photo ZIPs use `fflate` (MIT).
- **L3** — 2026-11-21 — Independent verification of T2 (Risk: item 1, data) reproduced: an import could leave a stored key paired with another host; a crafted provider id could block "Delete all" forever; a key pasted into a label, model, or URL path reached the export; no cap on unpacked ZIP size; out-of-range values accepted. Fixed test-first in the second commit: imported profiles get fresh ids, exports stop and name the field when a stored key appears in any string, ZIP and value bounds, a startup sweep for orphan photos, files, and keys. Worker reported 72 suites / 1247 tests and the Android export passing. Remaining: on Android the unencrypted export file stays in the app's private cache until the next app start; keys of profiles deleted by an older build cannot be found.
- **L4** — 2026-11-21 — T3 and T4 evidence: worker reported 83 suites / 1480 tests, `tsc`, `expo lint`, and the Android export passing; seen in the browser preview with development-only fakes that are absent from the release bundle. Suggestions send only the remaining numbers, the goal type, and the locale (tested on the bytes sent, per adapter). Export format stays at version 1 with an optional `barcode_products` list. Open question Q3 answered: `expo-camera` on Android pulls in Google ML Kit and Play services libraries, so an F-Droid build is not possible as is; typed barcode entry needs none of it. Not verified on a device: real barcode reads, the custom User-Agent, structured output for suggestions against real providers. A manual-entry button was added to the viewfinder (assumption) so the manual path is reachable.
- **L5** — 2026-11-21 — T5 and T6 evidence: worker reported 94 suites / 1642 tests, `tsc`, `expo lint`, and the Android export passing. Health Connect uses `react-native-health-connect` 4.1.3 (MIT); every state was seen only through an in-memory fake. Manifest changes: `WRITE_NUTRITION` and `READ_WEIGHT` health permissions, `minSdkVersion` 26, `versionCode` 1, and `usesCleartextTraffic` on so local models over plain HTTP work (the app's own URL rule still refuses HTTP outside local and private hosts). The release workflow has never run: manual dispatch needs the file on the default branch, so the first real Android build happens after the owner merges. Known gaps: the privacy link in Health Connect's permission screen opens the app's home screen; records of meals replaced by an import stay in Health Connect; weight import covers 30 days.
