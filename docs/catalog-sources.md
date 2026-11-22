# Catalog data sources

Which food composition data sets go into the bundled `catalog.db`, which do not, and why. Spec:
`odd/tasks/catalog-expansion.md` T1 (S1, S3, S4, S5). Rule being applied: `docs/12-legal-and-privacy.md` section 7 —
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

## 3. How an included set enters the catalog (S5)

- **Provenance.** Every `food` row stores `source` (`usda_foundation`, `usda_sr_legacy`, `usda_fndds`) and `source_id` (the FDC id).
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

| | Before (main: Foundation + SR Legacy) | After T1 (+ FNDDS, de-duplicated) | After T1 + T2 (Spanish names for every food, aliases) |
| --- | --- | --- | --- |
| Foods | 8,217 | 13,342 (424 Foundation, 7,676 SR Legacy, 5,242 FNDDS) | 13,342 |
| Duplicates dropped | 0 | 306 (117 SR Legacy entries that Foundation also publishes, 189 FNDDS entries that Foundation or SR Legacy publish; one more FNDDS food has no tracked nutrient and is left out) | 306 |
| Foods with household portions | 7,616 | 12,787 | 12,787 |
| Foods with a Spanish name | 124 | 124 | 13,342 |
| `food_name` rows | 8,341 | 13,444 | 37,144 |
| `catalog.db` | 6.0 MiB (6,258,688 bytes) | 10.1 MiB | 14.0 MiB (14,704,640 bytes) |

The size limit proposed by the task is about 25 MB: nothing needs trimming. If a later set pushes it over, the first candidates are the
1,275 branded and restaurant entries (about 10 % of the foods) and the 429 baby-food entries, which are near-duplicates of generic foods.
