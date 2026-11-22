# Catalog data sources

Which food composition data sets go into the bundled `catalog.db`, which do not, and why. Spec:
`odd/tasks/catalog-expansion.md` T1 (S1, S3, S4, S5); dishes calculated by the project from recipes: T4 (S4, S5, S7, S8), section 7. Rule being applied: `docs/12-legal-and-privacy.md` section 7 —
"Bundling any other data set (for example a national food table) requires confirming first that its license permits
redistribution inside an MIT project. Share-alike or non-commercial data must not be merged into the bundled catalog."

Research date: **2026-11-21**, on the publishers' own pages (URLs below). Pages were fetched on that day; if a publisher
changes its terms later, this file is out of date and the entry must be re-checked before the next catalog build.

## 1. Included

All three are US federal government works published by USDA through FoodData Central (FDC) with one licensing statement.

**Licensing statement**, <https://fdc.nal.usda.gov/api-guide>, section "Licensing", read 2026-11-21:

> USDA FoodData Central data are in the public domain and they are not copyrighted. They are published under CC0 1.0
> Universal (CC0 1.0). No permission is needed for their use, but we request that users list FoodData Central as the
> source of the data, and when possible, notify us of the product that uses the data so we may better track how FDC is
> being used in the public domain. The suggested citation is: U.S. Department of Agriculture, Agricultural Research
> Service. FoodData Central, 2019. fdc.nal.usda.gov.

The statement covers "FoodData Central data" as a whole; it does not carve out Survey Foods (FNDDS). Conditions: none.
The citation is a request, and the app already shows it (About screen). "Notify us" is a request, not a condition.

| Source id | Data set | Download (<https://fdc.nal.usda.gov/download-datasets>) | Used for |
| --- | --- | --- | --- |
| `usda_foundation` | Foundation Foods, 10/2026 | `FoodData_Central_foundation_food_json_2026-10-29.zip` (0.7 MB) | Generic foods, analytical values |
| `usda_sr_legacy` | SR Legacy, 04/2018 (final release) | `FoodData_Central_sr_legacy_food_json_2018-04.zip` (13.5 MB) | Generic foods, restaurant and branded-style entries |
| `usda_fndds` | **Survey Foods (FNDDS) 2021-2023**, released 10/2024 — new in this change | `FoodData_Central_survey_food_json_2024-10-31.zip` (3.8 MB zipped, 66 MB JSON, 5,432 foods) | Mixed dishes as eaten: empanada, sushi, paella, tacos, lentil dishes, sandwiches, soups |

FNDDS format: one JSON file, root key `SurveyFoods`; per food `fdcId`, `description`, `wweiaFoodCategory`,
`foodNutrients` (same FDC nutrient ids and units as the other two sets, per 100 g), `foodPortions`
(`portionDescription` + `gramWeight`). The 2021-2023 data are the newest FNDDS on the download page.

## 2. Not included

A set is listed here when its license does not clearly permit redistribution inside an MIT-licensed app, or when no
license could be found. Nothing below was bundled, scraped, or paraphrased into the catalog.

### 2.1 ARGENFOODS / Tabla de composición de alimentos (Universidad Nacional de Luján, Argentina) — NOT INCLUDED

- Pages: <http://www.unlu.edu.ar/~argenfoods/> and <http://www.unlu.edu.ar/~argenfoods/Tablas/Varios/Indice.htm>. Data as PDF and
  XLS per food group (`.../Tablas/Grupo/Cereales.xls`, ...). `www.argenfoods.unlu.edu.ar` failed the TLS name check.
- Text of the rights notice (Spanish, quoted): «© 2010, Universidad Nacional de Luján. Queda hecho el depósito que establece
  la ley 11723. No se permite la reproducción total o parcial de esta obra, ni su incorporación a un sistema informático,
  ni su locación, ni su transmisión en cualquier forma por cualquier medio, sea este electrónico, mecánico, por fotocopia,
  por grabación u otros métodos con fines comerciales. Para su uso comercial se deberá requerir el permiso o consentimiento
  por escrito del titular del derecho de autor o de su represente.» Source page footer: «© 2024, Universidad Nacional de Luján».
- Why not: all rights reserved, with commercial reuse and incorporation into an information system requiring written
  permission. MIT code lets anyone reuse the bundle commercially, so this is a non-commercial-type restriction (S4).
- What the owner would ask the publisher (contact on the page: bdca_unlu@yahoo.com.ar, Luján, Buenos Aires): written
  permission to redistribute the table's values inside an open-source app distributed under the MIT license, including
  downstream commercial reuse, with attribution; or the table under an open license (for example CC BY 4.0). Only then
  would the PDF/XLS files be parsed. This is the table that would cover milanesa, alfajor, medialuna, yerba mate.

### 2.2 BEDCA (Base de Datos Española de Composición de Alimentos, AESAN, Spain) — NOT INCLUDED

- Page: <https://www.bedca.net/bdpub/> (footer, quoted): «Copyright © 2007 [Consorcio BEDCA y Agencia Española de
  Seguridad Alimentaria y Nutrición], todos los derechos reservados» (English page: "All right[s reserved]"). The site is a
  query interface; no bulk download and no license grant were found on bedca.net or on the AESAN pages checked.
- Why not: all rights reserved, no reuse license.
- What the owner would ask (contact on bedca.net: bedca.adm@gmail.com; owner AESAN): written permission, or an open license, to
  redistribute the values inside an MIT-licensed app, and a bulk export format.

### 2.3 Mexico: Tabla de Composición de Alimentos y Productos Alimenticios Mexicanos (INCMNSZ) — NOT INCLUDED

- INFOODS lists it at `https://www.incmnsz.mx/2019/TABLAS_ALIMENTOS.pdf`; on 2026-11-21 that URL answers 404, and no publication
  page or rights notice was found on <https://www.incmnsz.mx/> or its nutrition section. The UNAM food base (BAM) sites did not
  answer, and the Mexican open data portal (`datos.gob.mx` API) answered 403 to automated access.
- Why not: no license could be confirmed (unclear = not included).
- What the owner would ask: INCMNSZ (Nutrición) for the current edition of the table, in a machine-readable form, and for
  written terms allowing redistribution under MIT.

### 2.4 LATINFOODS (regional INFOODS network) — NOT INCLUDED

- <https://www.fao.org/infoods/infoods/tables-and-databases/latin-america/en/> is a directory that links to each country's own
  publication (Argentina, Bolivia, Brazil, Chile, Colombia, Costa Rica, Cuba, Ecuador, Mexico, Peru); it is not a data set. The
  LATINFOODS site it points to (`http://www.inta.cl/latinfoods`) answers 404.
- FAO terms for its website content (<https://www.fao.org/contact-us/terms/en/>, quoted): content "may be copied, printed and
  downloaded for private study, research and teaching purposes, and for use in non-commercial products or services, provided
  that appropriate acknowledgement of FAO as the source and copyright holder is given"; "requests for [...] resale and other
  commercial use rights should be addressed to" FAO. Non-commercial only; the separate FAO statistical-database terms (CC BY 4.0)
  apply to FAO statistical databases, not to the INFOODS directory.
- Why not: nothing to bundle, and the only FAO terms on the page are non-commercial.
- What the owner would ask: nothing at network level; ask each country's publisher (2.1 to 2.3, 2.5).

### 2.5 Colombia, Brazil, Chile, Peru and the other tables on the INFOODS list — NOT INCLUDED

- Colombia, Tabla de Composición de Alimentos Colombianos 2018 (ICBF): <https://www.icbf.gov.co/tabla-de-composicion-de-alimentos-colombianos-tcac-2018>.
  The page offers a PDF (`/sites/default/files/tcac_web.pdf`, 16.8 MB) and states no license; the first 12 pages have no text layer, so
  the rights page could not be read either. Unclear: not included. Ask ICBF for an open license and the values as a spreadsheet.
- Brazil (TBCA, USP; TACO, UNICAMP), Chile (Universidad de Chile, 1990), Peru (INS), Costa Rica (INCIENSA), Cuba (INHA), Ecuador,
  Bolivia: listed by INFOODS as PDF, printed, or database-access publications. They were not individually researched
  beyond that listing; none is a clearly open, machine-readable bulk data set. Not included.
- Open data portals searched for a food composition table with an open license (CKAN/Socrata search "composición alimentos"):
  `datos.gob.ar` (0 results; the nearest, the ENNyS2 survey microdata under CC BY 4.0, is a consumption survey, not a composition
  table), `catalogodatos.gub.uy` (nothing relevant), `datos.gob.cl` (0), `datos.gov.co` (only animal-feed data under CC BY-SA 4.0:
  share-alike, and not human foods), `datos.gob.es` (API query failed), `datosabiertos.gob.pe` (blocked, HTTP 418). No open
  Spanish-language composition table was found.

### 2.6 Open, but not added in this change — owner decision

- **CIQUAL (ANSES, France).** data.gouv.fr lists the dataset with license id `fr-lo` (Licence Ouverte, which allows reuse with
  attribution; read from the data.gouv.fr API on 2026-11-21, the license text itself was not re-read). It would be compatible, but it
  is French-language, overlaps USDA for most staples, and adds mostly European products; it was not added because the gain for a
  Spanish/English catalog is small against the extra mapping and translation work. Say if you want it.
- Canadian Nutrient File, UK CoFID, Australian Food Composition Database, Fineli, Frida: their licenses were not confirmed (the
  pages tried did not load for automated access: Canadian Nutrient File no answer, Australian database 404, Fineli 403; the others
  were not tried); they mostly overlap USDA. Not added, not assessed.
- **Open Food Facts** (ODbL, share-alike): never bundled, per `docs/12` section 7 (looked up on demand only).

### 2.7 How each table above can be imported personally (food table import)

Spec: `odd/tasks/food-table-import.md` (S1 to S6). None of the tables above is bundled, and none will be: the app lets **each person import the
file they downloaded themselves**, on their own phone, for their own use. The app never downloads a table, ships no rows of any of them (in code,
tests, fixtures, documentation or commit messages), and an import makes no network request. A test (`noExcludedData.test.ts`) fails if a file in
the repository holds a marker of such a table's data (the header row of its published file, never a food or a value). The guide for people is
`docs/guides/importing-food-tables.md` (and `.es.md`); it links each publisher's own page, not a mirror.

How each one is published, checked on the publishers' own pages on **2026-11-22**, and what the app does with it:

| Table | Published as | Preset | What a person does |
| --- | --- | --- | --- |
| ARGENFOODS (2.1) | Twelve Excel files (`.xls`, one per food group, a PDF twin each) on the publisher's index page, plain `http`. Structure of a file: one sheet; title lines; a header row (`Nº`, `Alimento`, a species column, then one column per component with its unit in the header in parentheses); under it a row of INFOODS tagnames and a row of source references; then the foods; `...` and empty cells mean "no value". | Yes (`argenfoods`): header row, tag row, units from the headers, the group from the file's title; each file becomes one table. | Download the `.xls` of the groups wanted and import each. |
| BEDCA (2.2) | A web query only; no bulk download; all rights reserved. | No | Nothing to download; the generic import only works if AESAN supplies a spreadsheet. |
| Mexico, INCMNSZ (2.3) | A PDF (listed by INFOODS); its address answered 404 on the check date. | No | Ask INCMNSZ for a spreadsheet; generic import. |
| LATINFOODS list (2.4) | A directory of other publishers: PDF (most), a web database (Brazil, TBCA), a CD (Cuba), print only (Bolivia); Argentina's entry is ARGENFOODS. | No | Per country: a spreadsheet from its publisher, generic import. |
| Colombia, TCAC (2.5) | A PDF only (2018 and 2015). | No | Ask ICBF for a spreadsheet; generic import. |
| Other tables of 2.5 (Brazil TACO and TBCA, Chile, Peru, Costa Rica, Cuba, Ecuador, Bolivia, Uruguay, Central America) | PDF, web database, CD or print, as listed by INFOODS. | No | As above. |
| CIQUAL (2.6) | An Excel file (`.xls`, French and English) and XML, under the Licence Ouverte (as listed on data.gouv.fr). The publisher's site answered "maintenance" (HTTP 503) on the check date, so the files could not be opened. | Yes (`ciqual`), **not verified against the live file** (it keys on the publisher's identifier columns and the "(unit/100 g)" form of the headers, as in earlier releases). | Download the Excel file; import it. |

PDF-only and web-only tables get no reader, on purpose: it would be fragile and could silently misread a number (S4). The consequence is stated to the
person: those tables can be imported only through a spreadsheet version, if their publisher provides one. Where a person keeps an imported table,
**a personal export of their data carries it** (the export file then contains the table): the Data screen says so before sharing, and the guide says
not to share such a file.

## 3. How an included set enters the catalog (S5)

- **Provenance.** Every `food` row stores `source` (`usda_foundation`, `usda_sr_legacy`, `usda_fndds`, `usda_branded`, and `qbit_recipe` for the project's own calculated dishes, section 7) and `source_id` (the FDC id, or the recipe key).
  `catalog_meta` records the data version (file dates), the build date, and the file names.
- **Nutrients.** The 18 tracked nutrients are read by FDC nutrient id; the unit USDA publishes must equal the tracked unit
  (kcal, g, mg, µg), otherwise the value is dropped, never converted by guess. FNDDS publishes the same ids and units as
  Foundation and SR Legacy, so no unit conversion is needed. Missing values stay missing. The conversions were checked
  against rows read by hand from the published file (`scripts/catalog/__tests__/fndds.test.ts`: "Empanada, beef" 333 kcal,
  12.1 g protein, 27.4 g carbohydrate, 19.2 g fat, 459 mg sodium, 12 µg vitamin A, 0.82 µg B12; "Dulce de leche" 315 kcal,
  49.7 g sugars, 251 mg calcium).
- **No invented values.** Nothing is estimated, interpolated, or produced by a model. Spanish names and aliases are text only.
- **Household portions** (`food_portion`): FNDDS `portionDescription` + `gramWeight` ("1 regular/large" = 130 g for an
  empanada). Placeholders ("Quantity not specified"), per-ingredient "Guideline amount" rows, "Juice of", "Topping" and
  geometric measures (cubic/surface inch) are not household portions and are skipped.
- **State** (`raw`, `cooked`, `processed`, `unknown`): read from the description's words (cooked beats raw: "Apples, raw, boiled"),
  FNDDS "from dried / from raw / from fresh" = cooked, and, for FNDDS only, dishes, sandwiches and soups (WWEIA categories
  listed in `scripts/catalog/classify.ts`) count as cooked, since FNDDS describes foods as eaten.
- **Branded** (`is_branded`): restaurant categories, all-caps names, and a brand list that now includes the brands FNDDS names in
  parentheses (McDonalds, Burger King, Doritos, Clif Bar, ...).

## 4. De-duplication across sources

The same food can be published by more than one set (Foundation and SR Legacy overlap; FNDDS single foods derive from both). The
catalog keeps one:

- **Identity** = the description's words, lowercased, accent-free, singular, sorted (`dedupeKey` in `scripts/catalog/dedupe.ts`):
  "Bananas, raw" = "Banana, raw"; "Oil, coconut" = "Coconut oil". Foods that differ by any word are different foods.
- **Winner**: `usda_foundation` > `usda_sr_legacy` > `usda_fndds`. Analytical values beat values derived from them, and Foundation
  (10/2026) is newer than SR Legacy (frozen 2018). Entries of the winning source that share one name all stay (for example the
  restaurant and the generic "Hamburger, plain" of SR Legacy).
- **Portions**: a survivor with no household portions inherits those of a dropped duplicate; its own are never replaced and no
  nutrient value is merged.
- Dropped foods are counted in `catalog_meta.duplicates_dropped` and printed by `npm run catalog:build`.
- Limit: only identical descriptions are detected. "Rice, white, long-grain, regular, cooked" (SR Legacy) and "Rice, white,
  cooked, no added fat" (FNDDS) are different descriptions of different recipes and both stay; search ranks them (T3).

## 5. Build report

| | Before (main: Foundation + SR Legacy) | After T1 (+ FNDDS, de-duplicated) | After T1 + T2 (Spanish names) | After the follow-up (reviewed names, Spanish portions, regional foods) | After T4 (recipe-calculated dishes) |
| --- | --- | --- | --- | --- | --- |
| Foods | 8,217 | 13,342 | 13,342 | 13,348 (424 Foundation, 7,676 SR Legacy, 5,242 FNDDS, 6 Branded selection) | 13,393 (+45 `qbit_recipe`) |
| Foods with a Spanish name | 124 | 124 | 13,342 | 13,348 (685 handwritten, 233 reviewed, 12,430 composed) | 13,393 (730 handwritten, 233 reviewed, 12,430 composed) |
| `food_name` rows | 8,341 | 13,444 | 37,144 | 37,189 | 37,471 |
| `food_portion` rows | 14,572 | 29,384 | 29,384 | 58,780 (29,390 English + 29,390 Spanish) | 58,904 |
| `catalog.db` | 6.0 MiB (6,258,688 bytes) | 10.1 MiB | 14.0 MiB (14,704,640 bytes) | 15.5 MiB (16,269,312 bytes) | 15.7 MiB (16,412,672 bytes; schema version 4, plus the `recipe` and `recipe_ingredient` tables: 45 and 310 rows) |

The size limit proposed by the task is about 25 MB: nothing needs trimming. If a later set pushes it over, the first candidates are the
1,275 branded and restaurant entries (about 10 % of the foods) and the 429 baby-food entries, which are near-duplicates of generic foods.

## 6. Branded Foods: an optional, reviewed regional selection (follow-up B)

**Question.** Yerba mate, alfajor, medialuna and tortilla española have no entry in Foundation, SR Legacy or FNDDS. FoodData Central's
*Branded Foods* data set holds products from labels, so it may have them.

**License, read on 2026-11-22.** Same statement as section 1, <https://fdc.nal.usda.gov/api-guide>, "Licensing": "USDA FoodData Central
data are in the public domain and they are not copyrighted. They are published under CC0 1.0 Universal (CC0 1.0). No permission is
needed for their use, but we request that users list FoodData Central as the source of the data [...]". The statement is for all of
FoodData Central and does not exclude Branded Foods. <https://fdc.nal.usda.gov/data-documentation> describes Branded Foods as "Data from
labels of national and international branded foods collected by a public-private partnership". What CC0 does not give is any right to
the brands: brand names and logos are trademarks, so no brand appears in a food name (names are generic) and brand and owner are not
stored.

**Size.** `FoodData_Central_branded_food_json_2026-10-29.zip` is 195,941,393 bytes (about 196 MB), about 3 GB of JSON. Downloading it on every
build would be wasteful and is not done. The FDC API (`api.nal.usda.gov`) could fetch single foods, but needs an API key; the shared `DEMO_KEY`
answered 429 (rate limit) during this work, and no personal key was created.

**How it works.**

- `scripts/catalog/regional.ts` streams the zip once without loading it (`jsonStream.ts`: a streaming splitter, no new dependency):
  `npx tsx scripts/catalog/regional.ts candidates "alfajor" "yerba"` lists matching products; `... snapshot` rewrites
  `scripts/catalog/data/regional-foods.json` from the reviewed list `scripts/catalog/data/regional-selection.json`. The zip is downloaded by hand into
  `catalog-build/downloads/` (git-ignored) only when someone refreshes the selection.
- `regional-foods.json` is committed: six foods with their FDC id, tracked nutrient values per 100 g exactly as in the file, the data file name and
  generic names. `npm run catalog:build` reads only this small file. The foods are stored with `source = usda_branded` and the FDC id as
  `source_id`, `is_branded = 0` (they are generic by name). Nothing is estimated: a value the product's label does not give stays missing.
- Priority in de-duplication: below FNDDS.

**Added** (all from the 2026-10-29 Branded file; the label serving gives the grams of the portion):

| Food in the app | FDC id | kcal / 100 g (as in the file) | Portion |
| --- | --- | --- | --- |
| Alfajor de chocolate | 1948673 | 420 | 1 alfajor = 50 g |
| Alfajor, galleta rellena | 1147786 | 490 | 1 alfajor = 51 g |
| Alfajor bañado en chocolate, individual | 2586602 | 500 | 1 alfajor = 40 g |
| Tortilla española | 1886962 | 120 | 1/2 omelet = 100 g |
| Yerba mate, hierba seca | 359635 | 250 | 1 serving = 3 g (dry leaves; the infusion is not this) |
| Mate cocido, en saquito | 1873079 | 0 | 1 tea bag = 3 g (the label reports 0 for every tracked nutrient) |

**Not added: medialuna.** No product in the Branded file has "medialuna", "media luna" or a half-moon pastry that is the Argentine one (searched by
name; only "Media Crema" and half-moon pasta and shrimp rings match). A croissant is a different food and was not substituted. The owner can add it
as a custom food, or ask for a regional table (section 2.1).

## 7. Dishes calculated from recipes (T4, S7, S8)

**Question.** Milanesa, empanadas, medialuna, locro, mate, chipá and other dishes people in Argentina and nearby countries log every day have no entry in
any bundled data set, and the tables that have them are not bundled (section 2). The owner's request to copy the ARGENFOODS table and present it as the
project's own research was declined on 2026-11-22 (S7, L6); what the project can do is calculate its own entries.

**Answer.** 45 dishes (`source = 'qbit_recipe'`), each calculated from a documented home recipe written by the project, the per-100 g values of its
ingredients that are already in the catalog (sections 1 and 6), and published USDA cooking yields and nutrient retention factors. The method, the
formulas, the error, the dishes with their values, the dishes left out and the sanity tests are in **`docs/catalog-recipes.md`**. The recipes are
`scripts/catalog/data/recipes/*.json`, the factor tables `scripts/catalog/data/factors/*.json`.

**Inputs and license status, read on 2026-11-22.**

| Input | License status |
| --- | --- |
| Per-100 g values of the ingredients | Already in the catalog: USDA Foundation, SR Legacy, FNDDS, Branded selection (CC0, sections 1 and 6) |
| Recipes | Written by the project: original formulations, assumptions stated in each |
| USDA Table of Nutrient Retention Factors, Release 6 (2007), <https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/retn06.txt> | A publication of USDA ARS, a work of the US Government: no copyright in the US (17 U.S.C. section 105(a), read at law.cornell.edu). No license statement on the page or in the file; USDA's own policies page answered 403, so no USDA statement about reuse was read. Used |
| USDA Table of Cooking Yields for Meat and Poultry, Release 2 (2014), <https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.xlsx> | Same |
| FAO/INFOODS Food Composition Study Guide, module 8 | Read for method only; no number is taken from it (FAO's own terms for its content are non-commercial, section 2.4) |

**Not used.** ARGENFOODS, BEDCA and every other table of section 2: none was opened, read, downloaded or consulted, for values or for
cross-checking, and no number of theirs was reproduced from memory. A test (`recipeData.test.ts`) fails if a recipe file names one of them.
The plausible ranges of the sanity tests come from comparable foods already in the catalog, not from those tables.

**Provenance in the catalog (S5, S8).** Each dish is a `food` row with `source = 'qbit_recipe'`, `source_id` = the recipe key and an id from
900,000,001 up (FDC ids are far below it, so an id alone says "recipe"). `recipe` holds the method (texts in both languages, weights, weight rule,
nutrients not reported) and `recipe_ingredient` the ingredients with their yields and factor sources. `catalog_meta` records `recipe_set_version`
and `recipes`. A nutrient that an ingredient lacks is not reported for the dish, never turned into a zero. Nothing is estimated by a model.

**In the app.** A recipe-calculated food is marked "Calculated from a recipe" (Spanish: "Calculado a partir de una receta"), distinct from "Catalog" and
from "AI estimate", in the search results, the portion sheet, the review row and the meal detail, each with a way to read the method. The About
screen's data sources text (`about.sources.recipesNote`) says that some dishes are calculated from recipes and are not laboratory data.

**Limits.** These are typical-preparation estimates, not measurements: the weight of baked and stewed dishes comes from the water of a reference food of the
catalog (a weight rule only), fat absorbed in frying is an assumption, the USDA yield table covers meat and poultry only, the retention table covers 10 of
the 18 tracked nutrients, and ingredient values are USDA's, for American products. See `docs/catalog-recipes.md` section 8 before relying on a value.
