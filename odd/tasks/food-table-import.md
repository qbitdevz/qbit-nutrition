# Food table import

Lets a person load a food composition table they downloaded themselves into their own phone, so tables whose license forbids redistribution can still be used in full, personally.
Traceability: `bcdd/contrato.md` v7 (aprobado) — REQ-19, RN-16, RN-03, RN-05, RN-10. Branch `feat/food-table-import` from `main`.

## Specs

- **S1** — REQ-19, listo cuando: «Con un archivo de una tabla de alimentos descargado por la persona, la aplicación carga sus alimentos en el teléfono, se los puede buscar y registrar como cualquier otro, y se los puede quitar todos juntos».
- **S2** — RN-16: «Las tablas de alimentos cuya licencia no permite redistribuirlas no se incluyen en la aplicación ni en su código: cada persona importa su propio archivo y esos datos quedan solo en su teléfono.»
- **S3** — Owner: «me gusta la opción 1... podrías hacer con todas las listas también que mencionaste. así yo las importo una vez que tenga la app instalada». The lists mentioned are those marked "not included" in `docs/catalog-sources.md`: ARGENFOODS (Argentina), BEDCA (Spain), the Mexican INCMNSZ table, the Colombian TCAC, the tables listed by LATINFOODS, and CIQUAL (France).
- **S4** — Owner: «quiero tener toda la info que está en la tabla no a medias». An import keeps every food and every nutrient of the file that the app tracks, with the values exactly as they are in the file; nothing is altered, rounded differently, or dropped silently.
- **S5** — RN-05: every value shows where it came from. Imported foods are marked as imported, with the name of the table the person gave or the preset used.
- **S6** — RN-03: «Los datos de la persona quedan en su teléfono.» An import makes no network request.

Assumptions (not requested by the owner): the app never downloads a table itself and ships no rows of any such table, in code, tests, fixtures, or documentation; tests use synthetic files that only imitate each table's layout. Tables published only as PDF or only as a web query cannot be read reliably on a phone; for those the app offers the generic spreadsheet import and the guide explains how to get a spreadsheet, and the limitation is stated.

## Tasks

- [ ] T1 — S1, S2, S4, S5, S6 — Generic import: read CSV and spreadsheet files, map columns to names, units, and nutrients, preview, import as a named collection, search and log like any food, remove a collection — worker — commit:
- [ ] T2 — S2, S3, S4 — Presets that recognise the layout of each listed table where it is published as a spreadsheet, and a guide in English and Spanish on where each person gets the file — worker — commit:

## Log

- **L1** — 2026-11-22 — Owner request, verbatim: «me gusta la opción 1... podrías hacer con todas las listas también que mencionaste. así yo las importo una vez que tenga la app instalada». Earlier the owner asked to copy the ARGENFOODS table into the app and present it as own research, including with slightly changed values; the team declined (license forbids incorporation and commercial reuse without written permission) and offered this personal import instead.
