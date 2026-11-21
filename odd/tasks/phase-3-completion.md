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

- [ ] T1 — S1, S2, S10 — Progress: weekly and monthly averages, weight log and chart, body measurements — worker — commit:
- [ ] T2 — S3, S4, S10 — Data: export, import, delete all — worker, then independent verification (Risk: item 1) — commit:
- [ ] T3 — S5, S9, S10 — Barcode scanning with Open Food Facts — worker — commit:
- [ ] T4 — S6, S9, S10 — AI food suggestions — worker — commit:
- [ ] T5 — S7, S9, S10 — Health Connect: write meals, read weight — worker — commit:
- [ ] T6 — S8, S10, S11 — About and legal screens, privacy policy file, notice re-prompt on version change, setup guides, release workflow, docs brought in line with what was built — commit:

## Log

- **L1** — 2026-11-21 — Owner request, verbatim: «me voy al gym continua hasta finalizar todas las tareas.. yo te doy la autorizacion y aprobacion de lo que sea necesario..»
