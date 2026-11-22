# Regional dishes calculated from recipes

How the project's own entries for regional dishes are made, with which inputs, and how far they can be trusted. Spec:
`odd/tasks/catalog-expansion.md` T4 (S4, S5, S7, S8). Research date: **2026-11-22**, on the publishers' own pages (addresses below); a
factor source that changes its terms later must be re-read before the next catalog build.

## 1. What these entries are, and what a reader must not conclude

Some dishes people in Argentina and nearby countries log every day (milanesa, empanadas, medialuna, locro, mate, chipá, ...) have no
entry in the bundled USDA data sets, and the national tables that do have them are not bundled for license reasons
(`docs/catalog-sources.md` section 2). The project therefore **calculates** them: a documented home recipe written by the project, the
per-100 g values of its ingredients that are already in the catalog, and published cooking yields and retention factors.

The only inputs are:

1. the per-100 g values of ingredients already in the bundled catalog (USDA Foundation, SR Legacy, FNDDS, the Branded selection);
2. recipes written and documented by the project (`scripts/catalog/data/recipes/`), each an original formulation;
3. published, citable yield and retention factors whose terms allow use (section 3).

No value is copied from, derived from, or compared with ARGENFOODS, BEDCA, or any other table listed as "not included" in
`docs/catalog-sources.md`; none of their numbers was opened, read, downloaded or recalled. `recipeData.test.ts` fails if a recipe file
names one of those tables.

**What these values are not.** They are not laboratory data and not measurements of any dish anyone ate. They are the composition of
one typical home preparation, calculated. A real milanesa differs by the cut, the thickness, the breading, the oil, the pan; an empanada
by the dough and the fat of the filling. In particular a reader must not conclude that:

- a value is accurate to the digit it shows (they are stored to 3 decimals so that sums do not drift, not because they are that exact);
- a value is "the" composition of the dish in a country, a shop or a household;
- a missing nutrient is zero (it is not reported, section 2.5);
- a mate or tereré entry measures what the yerba contributes (it does not, section 8);
- the values suit a clinical use (dosing insulin, renal diets, allergen or sodium limits): they do not.

The app says so wherever it shows one of these foods (section 5).

## 2. The method

The standard recipe-calculation approach for food composition, as described by FAO/INFOODS (Food Composition Study Guide, module 8,
read for this work; section 9) and by the USDA tables themselves (section 3):

1. Write the recipe: ingredients, quantities in grams of **edible portion**, preparation method.
2. Take each ingredient's per-100 g values from the reference database (here: the catalog).
3. Apply a **yield factor** (cooked weight / raw weight) for the weight change in cooking, and a **nutrient retention factor** for the
   share of each nutrient that survives it.
4. Sum the nutrients of all ingredients, divide by the weight of the finished dish, express per 100 g.
5. Document the recipe, the factors and where they come from.

### 2.1 Formulas

For ingredient *i* with weight `g_i` (grams as used), per-100 g value `N_i,n` of nutrient *n*, retention `R_i,n` (0 to 1; 1 when the
table has no factor) and weight yield `y_i` (1 when none):

```
final weight        W = sum_i ( g_i x y_i )                       (ingredient yields rule)
nutrient in dish    T_n = sum_i ( g_i / 100 x N_i,n x R_i,n )
per 100 g of dish   V_n = T_n / W x 100
```

This is the FAO/INFOODS "ingredient method" (yield and retention factors applied at ingredient level). The guide's exercise gives the
same relation for one food: per 100 g cooked = value of the raw food x retention / yield factor. Retention is applied to the amount of
the nutrient in the raw ingredient (the USDA definition, "true retention", `%TR = Nc x Gc / (Nr x Gr)`), never to a concentration.
Energy, protein, carbohydrate and fat have no retention factor: their change is carried by the weight (and, in frying, by the added fat).
Code: `scripts/catalog/recipeCalc.ts` (pure, tested in `recipeCalc.test.ts`).

### 2.2 How the weight of the finished dish is set (one rule per recipe)

| Rule (`recipe.weight_rule`) | When | Source of the weight change |
| --- | --- | --- |
| `yields` | The weight change is in meat or poultry that the USDA table covers (and ingredients already taken in their cooked state, whose catalog value is for the cooked food) | The USDA cooking yield of that row, cited in the recipe |
| `moisture` | Dough, pastry, tarts, pizza, stews, anything that cooks down or takes up water, and for which no published yield exists | The water content (g per 100 g) of a **reference food of the catalog** (for example baked frozen biscuits, a butter croissant, canned beef stew): the solids of the group are kept and the water is lost or added down to the reference's. `final = solids / (1 - water/100)` |
| `declared` | The recipe states the weight of the batch | Supported by the code, not used by any recipe of this set |

The moisture rule only sets **weight**. No nutrient is ever taken from the reference food (the reference of the empanada dough is
"Biscuits, plain or buttermilk, frozen, baked", 26.7 % water; nothing else of it is used). This is the weight-change handling that is
possible without a published yield, and it is the largest source of error for baked goods and stews (section 8). The reference of each
group is named in the recipe and in its `basis` text.

A recipe may mix both: the beef of the empanada filling uses a USDA yield, the dough is a moisture group. A moisture group can also
**add** water (a stew whose pot water is not listed, gnocchi that take up water in boiling): the water of the pot is implied by the
reference's moisture, so it is never listed as an ingredient.

### 2.3 Fat and oil absorbed in frying

Fried foods take up oil, and no published figure for "oil absorbed by a milanesa" or by an empanada was found among the sources read. The
recipe therefore **states an amount** (for example 10 g of oil per milanesa, 8 g per fried empanada) as an ingredient with
`absorbed: true`. It is an assumption of the project, not a measurement, and the recipe's `basis` says so in both languages
(`recipeData.test.ts` checks that). The oil is counted whole in the finished weight and in the energy. Oil left in the pan is not counted.

### 2.4 Edible portions

Every ingredient is a catalog food, whose values are for the edible portion as USDA publishes them (peeled, boned, trimmed as the entry
says). The recipe lists grams of that edible portion; no refuse coefficient is applied, and bones, peel and trimmed fat are not in the
dish weight. Potatoes are weighed as "flesh and skin, raw" (the skin stays in their value).

### 2.5 Unknown is not zero

The FAO/INFOODS guide is explicit that turning a missing value into a zero in a calculated dish is "a major error". The calculator
(`calculateRecipe`) reports a nutrient as **unknown** (left out of the dish, listed in `recipe.unknown_nutrients`) when any
**significant** ingredient lacks it. An ingredient is significant when it is at least **5 %** of the weight of the ingredients
(`SIGNIFICANT_SHARE`, a threshold chosen by the project). A minor ingredient (a pinch of spice) lacking a nutrient counts as zero and is
recorded in the calculation (`understatedBy`), because dropping every nutrient for a gram of cumin would hide the rest. The gaps that
remain visible in the catalog are mostly vitamin D (flour and breadcrumbs have no value for it in SR Legacy), and sugars, fiber or
vitamin C when a Foundation ingredient is incomplete.

An ingredient may have a twin from a higher-priority source (the same description in Foundation and SR Legacy): the catalog keeps one
(`docs/catalog-sources.md` section 4). The recipe names the exact food it used (`source`, `source_id` in `recipe_ingredient`);
`ingredient_food_id` points to the food that stands for it in the catalog, which is what the app shows.

### 2.6 Rounding

Nutrient values are stored rounded to 3 decimals; the sum is done before rounding.

## 3. Factor sources: what was found, what was read, and the license status

Both are publications of the **USDA Agricultural Research Service, Nutrient Data Laboratory**, found through the ARS page "Database
Resources" of the Methods and Application of Food Composition Laboratory
(<https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/database-resources/>,
section "Special purpose data"), read on 2026-11-22.

| | Retention factors | Cooking yields |
| --- | --- | --- |
| Title | USDA Table of Nutrient Retention Factors, Release 6 (December 2007) | USDA Table of Cooking Yields for Meat and Poultry, Release 2 (September 2014) |
| Page | <https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/nutrient-retention-factors/> (last modified 2020-05-08) | <https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/methods-and-application-of-food-composition-laboratory/mafcl-site-pages/cooking-yields/> (last modified 2020-05-08) |
| Files read | `retn06.pdf` (124 KB, introduction, methods, references) and `retn06.txt` (545 KB, the data: 270 retention codes, 26 nutrients) | `USDA_CookingYields_MeatPoultry02.pdf` (introduction, equations, study descriptions) and `.xlsx` (the data: 173 rows) |
| Status | Current on the ARS page on 2026-11-22; Release 6 replaces Release 5 and has not been replaced; the factors are reported to the nearest 5 % | Current on the ARS page; Release 2 is an update of Release 1 and has not been replaced |
| Covers | 25 vitamins, minerals and alcohol for about 290 foods, by cooking method | Cooking yield %, moisture change and fat change, with n, SD, minimum and maximum, for retail cuts of beef, pork, lamb, veal, chicken, turkey and game |
| Does **not** cover | Energy, macronutrients, fiber, sugars, saturated fat and vitamin D (tracked by the app); vitamin A is given as "Vitamin A, RE", not RAE | Anything that is not meat or poultry: no yield for vegetables, dough, rice, legumes, eggs, cheese or fish |
| Committed as | `scripts/catalog/data/factors/usda-retention-r6.json` (only the 10 tracked nutrients the table covers) | `scripts/catalog/data/factors/usda-cooking-yields-r2.json` (all 173 rows) |

**License status.** Neither file carries a license statement or a copyright notice on the page, in the PDF or in the data. Both were
prepared by USDA ARS staff (the title pages name the Nutrient Data Laboratory and its authors). A work of the United States Government
has no copyright protection in the United States: **17 U.S.C. section 105(a)**, "Copyright protection under this title is not available
for any work of the United States Government" (read on <https://www.law.cornell.edu/uscode/text/17/105> on 2026-11-22). On that basis the
tables are usable and are included; the suggested citation of the yield table ("U.S. Department of Agriculture, Agricultural Research
Service. 2014. USDA Table of Cooking Yields for Meat and Poultry, Release 2.") is followed. **What could not be confirmed:** the USDA
policies page (<https://www.usda.gov/policies-and-links>) answered 403 to automated access, so no statement of USDA's own about
reuse of these two files was read; and the FoodData Central CC0 statement quoted in `docs/catalog-sources.md` section 1 is about
FoodData Central data and does not mention these tables. The conclusion rests on section 105 and on the files being publications of a
federal agency. If the owner wants a written statement, the contact on both documents is `ndlinfo@ars.usda.gov`. The ARS pages carried, on
the day, a banner about a court order ("Order Granting Motion for Stay Under 5 USC 705"); it is a notice of the site, was not examined, and
does not mention these files.

**Where the factors are used.** The beef of milanesas (top round steak, broiled, 72 %), chicken breast (baked or roasted, 72 %), ground
beef crumbles (pan-fried, 67 %), fresh pork sausage (pan-fried, 80 %), pork loin chops (pan-fried, 77 %), beef tenderloin (broiled, 80 %); and
retention codes for meat, eggs, cheese, milk, flour, vegetables, potatoes and legumes. When no row names the exact cut or method the nearest
row is used and the recipe's `basis` says "nearest" (a thin pan-fried cutlet takes the broiled top round yield; fried foods take the
"fried" retention row). Pairs that look alike but differ in the table (for example "simmered with drippings" and "without drippings")
were chosen by whether the cooking liquid is eaten.

**Not used, and why.** Nothing was taken from any table whose license is unclear. If a factor source cannot be confirmed as usable it is
not used. Every yield or retention that is *not* in the two tables above is simply absent: the recipe applies none and says so
("no published factor"), and the entry shows "No published yield or retention factor was applied to this dish". Vitamin D, fiber, sugars and
saturated fat are never reduced by cooking in this method (no usable factor).

## 4. Recipes as data

`scripts/catalog/data/recipes/*.json` (one array per file; `_meta.json` holds the set version). One entry per dish:

| Field | Meaning |
| --- | --- |
| `id` | Stable number, never reused or renumbered. The food id is `900,000,000 + id` (`RECIPE_ID_BASE`, `src/core/catalog/recipes.ts`): FoodData Central ids are far below it, so an id alone tells the app the food is a recipe, which is how a saved meal item (`food_source = catalog`, `food_ref = id`) is recognized |
| `key` | Stable slug, stored as `food.source_id` |
| `nameEn`, `nameEs`, `aliasesEn`, `aliasesEs` | Names and regional aliases in both languages (text only) |
| `dishType`, `state` | Kind of dish (the sanity tests give each kind a range, section 7) and `cooked` where it applies |
| `ingredients` | `source` + `sourceId` (never a row id) + `description` (the catalog's own description: the build stops if it differs, so a wrong id cannot pass) + `grams`; optional `yield` (key `ndb|method` of the USDA yield table), `retention` (code of the retention table), `group` (a moisture group) and `absorbed` |
| `moistureGroups` | The reference food (`source`, `sourceId`, `description`) whose water sets the weight of each group |
| `finalGrams` | Declared batch weight (unused) |
| `preparation`, `basis` | In both languages: the preparation, and where the proportions come from with every assumption (cut, breading, oil absorbed, nearest factor) |
| `portions` | Household measures in both languages with grams |

Each recipe is a typical home preparation written by the project from general culinary knowledge and ordinary quantities, with its
assumptions stated. None is a transcription of a published recipe.

## 5. Build integration and marking in the app (S8)

`npm run catalog:build` loads the recipes and the factor tables, resolves every ingredient against the source foods **by source and id**,
calculates each dish and writes it as a food with `source = 'qbit_recipe'`, `state` as declared, `is_branded = 0`, a stable id, portions
and names in both languages. `catalog_meta` records `recipe_set_version` and `recipes`; `schema_version` is 4. Two tables hold the method:
`recipe` (key, version, preparation and basis in both languages, raw and final grams, weight rule, unknown nutrients) and
`recipe_ingredient` (position, the exact food used, the catalog food standing for it, grams, yield and where it comes from, retention and
where it comes from, absorbed fat).

**A recipe whose ingredient is missing from the catalog data fails the build**, naming the recipe and the ingredient, for example:
`Recipe "milanesa-carne-frita": ingredient usda_sr_legacy:999 ("Wheat flour") is not in the catalog data`. A wrong description, an unknown
yield or retention key, a duplicate id or key, or a recipe with both a declared weight and a yield also fail.

The app marks a recipe-calculated food, in English and Spanish, as **"Calculated from a recipe"** (an icon of a plate on a blue tint),
which is distinct from catalog laboratory data ("Catalog", plain) and from an AI estimate (a sparkle on teal), in: the search results
(also favorites and recents), the portion sheet (with a **"How it was calculated"** button that opens the method inline), the review row
(instead of "Catalog"; a button that opens the method) and the meal detail (a button on the item). The method lists the ingredients as
used before cooking with the yield applied, the weights, the preparation, where the proportions come from, the published factors used, the
nutrients not reported, the recipe set and a note that real dishes vary. The About screen's data sources text says that some dishes are
calculated from recipes and are not laboratory data.

## 6. Three recipes worked out by hand

The three are pinned in `scripts/catalog/__tests__/recipeHandChecks.test.ts` (no catalog needed) and compared with the built database in
`recipeCatalog.test.ts`. Ingredient values are SR Legacy per 100 g, as in the catalog.

**Milanesa de carne, frita** (yield and retention at ingredient level). 120 g raw top round steak (124 kcal, 23.5 g protein, 0 carbs, 3.34 g
fat; folate 4 µg, B12 1.64 µg) at 72 %; 20 g egg (143, 12.6, 0.72, 9.51; folate 47, B12 0.89); 25 g dry breadcrumbs (395, 13.4, 72, 5.3; folate
107, B12 0.35); 10 g soybean oil absorbed (884 kcal, 100 g fat); 1 g salt. Finished weight = 120 x 0.72 + 20 + 25 + 10 + 1 = **142.4 g**.
Energy = 1.2 x 124 + 0.2 x 143 + 0.25 x 395 + 0.1 x 884 = 364.55 kcal, so **256.0 kcal per 100 g**; protein 34.07 g, **23.9 g**; carbs 18.144 g,
**12.7 g**; fat 17.235 g, **12.1 g**. Folate with the retention of beef fried (85 %), eggs fried (75 %) and flour sautéed (65 %) =
4.08 + 7.05 + 17.3875 = 28.5175 µg, **20.0 µg**; B12 with 80 %, 85 % and 100 % = 1.5744 + 0.1513 + 0.0875 = 1.8132 µg, **1.27 µg**.

**Empanada de carne, al horno** (a yield plus a moisture group). Dough: 24 g flour (water 11.9 %), 6 g lard, 9 g water, 0.4 g salt; solids
21.144 + 6 + 0.009 + 0.3992 = 27.5522 g, baked down to the 26.7 % water of baked frozen biscuits: 27.5522 / 0.733 = 37.588 g. Filling:
28 g raw ground beef (85/15) at 67 % = 18.76 g, plus 18 g onion, 8 g hard-boiled egg, 3 g olives, 2 g lard, 0.3 g paprika, 0.2 g cumin,
0.4 g salt = 50.66 g. Finished weight **88.25 g**. Energy 87.36 + 54.12 + 60.2 + 7.2 + 12.4 + 4.35 + 18.04 + 0.846 + 0.75 = 245.266 kcal, so
**277.9 kcal per 100 g**; protein 8.995 g, **10.2 g**; carbs 20.448 g, **23.2 g**; fat 13.844 g, **15.7 g**.

**Medialuna de manteca** (the whole pastry as a moisture group). 24 g flour, 12 g butter, 6 g sugar, 4 g egg, 6 g milk, 0.5 g yeast, 0.3 g salt:
solids 39.6388 g, baked to the 23.2 % water of a butter croissant: 39.6388 / 0.768 = **51.6 g**; energy 87.36 + 86.04 + 23.22 + 5.72 + 3.66 +
1.625 = 207.625 kcal, so **402.3 kcal per 100 g** (the croissant itself is 406).

## 7. The dishes

Energy and macronutrients per 100 g as built; "weight rule" as in section 2.2; unknown = nutrients not reported. Sources of the plausible
ranges: section 7.2.

| id | Dish (Spanish; English) | kcal | Protein g | Carbs g | Fat g | First household measure | Weight rule | Not reported |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Milanesa de carne, frita; Milanesa, breaded beef cutlet, pan-fried | 256 | 23.9 | 12.7 | 12.1 | 1 milanesa mediana = 140 g | yields | vit_d |
| 2 | Milanesa de carne, al horno; Milanesa, breaded beef cutlet, baked | 233 | 24.8 | 13.2 | 8.9 | 1 milanesa mediana = 135 g | yields | — |
| 3 | Milanesa de pollo, frita; Milanesa, breaded chicken breast cutlet, pan-fried | 248 | 23.5 | 12.1 | 11.1 | 1 milanesa mediana = 150 g | yields | vit_d |
| 4 | Milanesa de pollo, al horno; Milanesa, breaded chicken breast cutlet, baked | 227 | 24.3 | 12.5 | 8.0 | 1 milanesa mediana = 145 g | yields | — |
| 5 | Milanesa a la napolitana; Milanesa napolitana, beef cutlet with ham, mozzarella and tomato | 206 | 19.7 | 9.4 | 9.9 | 1 milanesa napolitana = 248 g | yields | — |
| 6 | Empanada de carne, al horno; Empanada, Argentine beef, baked | 278 | 10.2 | 23.2 | 15.7 | 1 empanada = 88 g | moisture | — |
| 7 | Empanada de carne, frita; Empanada, Argentine beef, fried | 337 | 9.9 | 23.6 | 22.4 | 1 empanada = 93 g | moisture | vit_d |
| 8 | Empanada de jamón y queso, al horno; Empanada, ham and cheese, baked | 305 | 14.0 | 23.5 | 16.7 | 1 empanada = 82 g | moisture | — |
| 9 | Empanada de humita, al horno; Empanada, corn (humita) and cheese, baked | 222 | 5.4 | 26.6 | 10.8 | 1 empanada = 108 g | moisture | — |
| 10 | Tarta de jamón y queso; Tart, ham and cheese, homemade | 332 | 16.1 | 22.4 | 19.4 | 1 porción (1/8 de la tarta) = 86 g | moisture | — |
| 11 | Tarta de verdura (acelga y huevo); Tart, chard, egg and cheese, homemade | 242 | 8.0 | 25.0 | 12.3 | 1 porción (1/8 de la tarta) = 82 g | moisture | — |
| 12 | Medialuna de manteca; Medialuna, butter crescent roll | 402 | 6.7 | 48.1 | 20.5 | 1 medialuna = 52 g | moisture | — |
| 13 | Medialuna de grasa; Medialuna, beef-fat crescent roll | 420 | 5.8 | 46.7 | 22.9 | 1 medialuna = 44 g | moisture | — |
| 14 | Choripán; Choripán, grilled chorizo in french bread | 331 | 13.8 | 26.4 | 19.0 | 1 choripán = 175 g | yields | — |
| 15 | Provoleta a la parrilla; Provoleta, grilled provolone cheese with oregano | 358 | 25.2 | 2.2 | 27.5 | 1 provoleta individual = 150 g | yields | — |
| 16 | Locro; Locro, corn, bean, squash and meat stew | 93 | 6.0 | 6.4 | 4.8 | 1 plato hondo = 300 g | moisture | — |
| 17 | Guiso de lentejas; Lentil stew with chorizo, potato and vegetables | 87 | 4.6 | 9.7 | 3.6 | 1 plato hondo = 390 g | moisture | — |
| 18 | Puchero; Puchero, boiled beef, sausage and vegetables | 110 | 8.5 | 10.7 | 3.8 | 1 plato = 620 g | yields | sugars, vit_d |
| 19 | Pastel de papas; Pastel de papas, beef pie topped with mashed potato | 143 | 6.9 | 10.7 | 8.2 | 1 porción individual = 350 g | yields | — |
| 20 | Ñoquis con salsa de tomate; Ñoquis, potato gnocchi with tomato sauce | 101 | 2.8 | 18.3 | 1.9 | 1 plato = 415 g | moisture | — |
| 21 | Fideos con tuco; Pasta with tuco, tomato and onion sauce | 122 | 3.8 | 20.6 | 2.8 | 1 plato = 360 g | yields | — |
| 22 | Pizza de muzzarella a la piedra; Pizza muzzarella, stone-baked, mozzarella and tomato | 258 | 11.9 | 29.0 | 10.3 | 1 porción (1/8 de pizza) = 105 g | moisture | — |
| 23 | Fainá; Fainá, baked chickpea-flour flatbread | 213 | 7.3 | 18.9 | 12.0 | 1 porción = 38 g | moisture | vit_d |
| 24 | Tortilla de papas; Tortilla de papas, potato and onion omelet | 171 | 6.6 | 15.4 | 9.4 | 1 porción (1/4 de la tortilla) = 130 g | moisture | — |
| 25 | Revuelto gramajo; Revuelto gramajo, scrambled eggs with fries and ham | 168 | 8.9 | 11.3 | 9.7 | 1 plato = 369 g | yields | — |
| 26 | Sándwich de miga de jamón y queso; Sandwich de miga, ham and cheese on crustless white bread | 270 | 12.8 | 29.2 | 11.1 | 1 triángulo = 53 g | yields | — |
| 27 | Pebete de jamón y queso; Pebete, soft roll with ham and cheese | 263 | 13.9 | 27.9 | 10.4 | 1 pebete = 104 g | yields | — |
| 28 | Tostado de jamón y queso; Tostado, toasted ham and cheese sandwich | 256 | 14.6 | 24.3 | 10.9 | 1 tostado = 109 g | yields | — |
| 29 | Alfajor de maicena; Alfajor de maicena, cornstarch cookies with dulce de leche and coconut | 439 | 4.7 | 64.2 | 18.0 | 1 alfajor = 46 g | moisture | — |
| 30 | Chocotorta; Chocotorta, chocolate cookie, dulce de leche and cream cheese cake | 308 | 5.9 | 37.0 | 15.6 | 1 porción (1/8 de la torta) = 131 g | yields | — |
| 31 | Flan casero con dulce de leche; Flan, homemade caramel custard with dulce de leche | 169 | 5.9 | 24.8 | 5.3 | 1 porción (1/6 del flan) = 135 g | moisture | — |
| 32 | Mate cebado, amargo; Mate, brewed yerba mate, unsweetened | 0 | 0.0 | 0.0 | 0.0 | 1 mate (150 mL) = 150 g | yields | — |
| 33 | Mate cebado, con azúcar; Mate, brewed yerba mate, with sugar | 12 | 0.0 | 3.2 | 0.0 | 1 mate (150 mL) = 155 g | yields | — |
| 34 | Mate cocido con leche; Mate cocido with milk and sugar | 39 | 1.5 | 4.8 | 1.6 | 1 taza (200 mL) = 205 g | yields | — |
| 35 | Tereré con limón; Tereré, cold yerba mate with lemon juice | 1 | 0.0 | 0.3 | 0.0 | 1 guampa (200 mL) = 210 g | yields | — |
| 36 | Café con leche; Café con leche, coffee with whole milk | 31 | 1.6 | 2.4 | 1.6 | 1 taza (200 mL) = 200 g | yields | — |
| 37 | Submarino; Submarino, hot milk with a chocolate bar | 104 | 3.6 | 9.8 | 5.7 | 1 vaso (250 mL) = 275 g | yields | — |
| 38 | Chipá; Chipá, cassava starch and cheese bread roll | 398 | 10.4 | 47.8 | 18.2 | 1 chipá = 38 g | moisture | — |
| 39 | Sopa paraguaya; Sopa paraguaya, baked cornmeal, cheese and onion cake | 315 | 13.8 | 27.2 | 17.0 | 1 porción (1/9) = 61 g | moisture | — |
| 40 | Arepa rellena de queso; Arepa filled with cheese | 254 | 9.5 | 31.9 | 10.3 | 1 arepa = 147 g | moisture | — |
| 41 | Tacos al pastor; Tacos al pastor, pork, pineapple and onion on corn tortillas | 201 | 11.0 | 20.1 | 8.8 | 1 taco = 77 g | yields | — |
| 43 | Causa limeña; Causa limeña, chilled yellow potato terrine with tuna | 145 | 5.6 | 10.6 | 9.3 | 1 porción = 370 g | yields | — |
| 44 | Lomo saltado; Lomo saltado, stir-fried beef with onion, tomato, fries and rice | 163 | 6.9 | 15.4 | 8.3 | 1 plato = 570 g | yields | vit_d |
| 45 | Feijoada; Feijoada, black beans stewed with sausage, bacon and beef | 178 | 11.7 | 11.9 | 9.3 | 1 plato = 455 g | yields | — |
| 47 | Pabellón criollo; Pabellón criollo, shredded beef, black beans, rice and fried plantain | 181 | 9.7 | 19.5 | 7.3 | 1 plato = 545 g | moisture | — |

45 dishes. Vitamin D is the nutrient most often not reported (`vit_d`): flour and breadcrumbs have no value for it in SR Legacy.

### 7.1 Candidates left out, and why

Each candidate was checked against the built catalog first; one with a good entry is skipped. Built and then removed after the comparison:
ceviche and gallo pinto.

| Candidate | Why it is not in the set |
| --- | --- |
| Factura | A generic word for assorted pastries (vigilantes, cañoncitos, bolas de fraile, ...): no single recipe. The medialuna, the one most logged, is in |
| Asado (cuts not present) | The USDA yield table has a grilling row for flank, skirt, rib eye and tenderloin, and the catalog already holds those cuts as cooked, broiled entries. The cut that is not present, cross-cut short ribs (tira de asado), has only a braised yield in the table (66 %); a grilling yield would be an invention |
| Pancho | Covered: FNDDS "Hot dog sandwich, NFS, on white bun", "Hot dog, beef" and the SR/FNDDS hot dog bun |
| Tostones | Covered: SR Legacy "Plantains, green, fried" |
| Arroz con leche | Covered: SR Legacy "Restaurant, Latino, arroz con leche (rice pudding)" and FNDDS "Pudding, rice" |
| Ceviche | Covered by FNDDS "Ceviche" (63 kcal per 100 g). A recipe was calculated (69 kcal) and removed after the comparison |
| Gallo pinto | Covered: SR Legacy "Restaurant, Latino, Arroz con frijoles negros (rice and black beans)" and FNDDS "Beans and white rice". A recipe was calculated (132 kcal) and removed; the name "gallo pinto" is not yet an alias of those entries (a names-only change, outside this task) |
| Flan | Partly covered (SR "flan, caramel custard, prepared-from-recipe"); the flan **with dulce de leche** is in |
| Empanada de carne, de jamón y queso, de humita | In although FNDDS has "Empanada, beef" and others: those do not tell baked from fried, have no ham and cheese or humita, and are not the Argentine filling. They are kept apart by name and are not duplicates |

Every other candidate of the task list is in the set. No dish was left out for a missing ingredient.

### 7.2 Sanity gates over the built catalog (`recipeCatalog.test.ts`)

- **Energy against macronutrients**: `|kcal - (4 protein + 4 carbs + 9 fat)| <= max(10 % of kcal, 8 kcal)`. 95.4 % of the other 12,887 foods of the
  catalog meet the same rule, measured on the built catalog; the largest deviation among the dishes is 6.8 kcal.
- **Physical bounds**: no negative or non-finite value; protein + carbs + fat <= 100 g; energy <= 902 kcal; sugars, fiber <= carbs and
  saturated fat <= fat (sugars with a 10 % + 0.2 g margin: USDA obtains carbohydrate by difference and whole milk itself has more sugars than
  carbohydrate); energy and macronutrients not above the richest ingredient once concentration by weight loss is allowed; no nutrient above
  the highest value the catalog holds for it; the nutrients a dish reports are exactly those no significant ingredient lacks.
- **Range per kind of dish**: for each `dishType` the test lists 3 to 7 **comparable foods of the catalog itself** (by English description: for
  example "Empanada, beef", "Quiche with meat, poultry or fish", "Croissants, butter", "Ham sandwich on white, with cheese") and requires every
  dish of that kind to have an energy from 0.75 x the lowest to 1.25 x the highest of them. All comparables are USDA Foundation, SR Legacy or
  FNDDS entries already in the catalog; none is an excluded table.
- **Weights**: raw weight = sum of the grams; with the `yields` rule, finished weight = sum of grams x yield (to 0.001 g); other rules give
  a weight above zero and not above four times the ingredients; the first household measure is not heavier than the finished batch.
- **Names and search**: every dish keeps its Spanish and English names and aliases (no qualifier was added), and is found by its own name in the
  top 3 in the language of the name. The search query set has 80 more queries on these dishes, 40 in each language.
- **Hand-calculated** milanesa, empanada and medialuna agree with the database (section 6).

A cross-check against the closest comparable food of the catalog (a consistency check, not a validation): empanada de carne al horno 278 vs
"Empanada, beef" 333 kcal; frita 337; tarta de jamón y queso 332 vs "Quiche with meat" 387; pizza 258 vs the cooked frozen cheese pizza 268;
medialuna 402 vs "Croissants, butter" 406; tostado 256 vs "Ham sandwich on white, with cheese" 213 (a butter-toasted sandwich of this
recipe is richer); lentil stew 87 vs "Soup, lentil, with meat" 78 and "Beef stew, canned entree" 99. Differences of up to about +-20 % from the
closest comparable were seen, in both directions.

## 8. Known error, and the honest limits

- **Weight change is the largest error.** For dough, pastry, tarts, pizza and stews the finished weight comes from the water content of a
  reference food, not from a measurement of that dish. Every per-100 g value of such a dish scales with that weight: an error of 10 % in the
  final weight is an error of 10 % in the value (and in every nutrient). Vegetables and cheese in the oven, simmered sauces and boiled
  vegetables have no published yield in the sources read; where none is applied the values are somewhat diluted (the recipe says so).
- **Fat absorbed in frying is an assumption.** A change of 5 g of oil in a 140 g milanesa moves its energy by about 30 kcal per 100 g.
- **Published factors carry their own spread.** The USDA yields have a standard deviation of about 3 to 6 percentage points where reported
  (top round steak 72 +- 5.3 %; ground beef crumbles 67 +- 3.5 %, n = 4), and retention factors are given to the nearest 5 % and are
  sometimes imputed from similar foods (the document says so). The nearest row is not always the same cut or method.
- **Retention covers 10 of the 18 tracked nutrients.** Vitamin D, fiber, sugars and saturated fat are not reduced; vitamin A uses retinol
  equivalents, not RAE. Vitamin C and folate are the least reliable values of a cooked dish.
- **Ingredient values are USDA values**, which are for American products: an Argentine flour, cheese, chorizo or dulce de leche differs
  (the catalog has no Argentine ingredient data). Dulce de leche is the SR Legacy entry; cassava starch is represented by dry pearl
  tapioca; local fish by Atlantic cod; the chorizo by USDA pork chorizo.
- **Recipes vary between households** by more than the calculation does; the recipes are one typical preparation each.
- **Mate, tereré and mate cocido.** The infusion is treated as water (plus sugar, milk, lemon where listed): no published figure for what
  the infusion carries over from the yerba was found, so the yerba contributes nothing and the real values may be slightly above zero. The
  catalog's yerba mate entry is the dry leaf.
- **Typical size of the error.** For energy of a baked or fried dish, a reader should expect 10 to 20 % either way from the closest real
  preparation; for vitamins and minerals more; for sodium, whatever salt the cook adds is a guess (the recipes list a nominal amount).

## 9. References actually read

- FAO/INFOODS. *Food Composition Study Guide, Vol. 1 Questions and exercises* (2nd revised version), U. R. Charrondière, B. Burlingame, S.
  Berman, I. Elmadfa; FAO, Rome. Module 8 "Recipe and other calculations" (definitions of yield factor and retention factor, the four
  calculation methods, the order of steps, the exercise on boiled foods). <https://www.fao.org/3/a-ap802e.pdf>, read 2026-11-22; page of
  FAO/INFOODS on recipes: <https://www.fao.org/infoods/infoods/recipes/en/>. Used for method only; no number comes from it. The cited
  EuroFIR, Greenfield & Southgate (2003) and Rand et al. (1991) works that the module lists were **not** read.
- USDA, ARS, Nutrient Data Laboratory. *USDA Table of Nutrient Retention Factors, Release 6* (2007): introduction, methods and the data file.
  <https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/retn06.pdf> and `retn06.txt` in the same folder. It cites Murphy EW, Criner PE,
  Gray BC (1975) for true retention; that paper was not read.
- USDA, ARS, Nutrient Data Laboratory. *USDA Table of Cooking Yields for Meat and Poultry, Release 2* (2014), J. M. Roseland, Q. V. Nguyen,
  J. R. Williams, K. Y. Patterson, B. A. Showell, P. R. Pehrsson: introduction, equations, the studies and the table.
  <https://www.ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.pdf> and `.xlsx`.
- 17 U.S.C. section 105, "Subject matter of copyright: United States Government works", <https://www.law.cornell.edu/uscode/text/17/105>.

## 10. Changing the set

1. Edit or add a recipe in `scripts/catalog/data/recipes/`; find ingredient ids in the catalog sources (the build checks the description);
   never reuse an id.
2. Bump the version in `_meta.json` (`catalog_meta.recipe_set_version`).
3. `npm run catalog:build`, then `npx jest scripts/catalog src/core/catalog`: the data, hand-check and sanity tests must pass.
4. A new factor release: run `python -I scripts/catalog/tools/factorsFromUsda.py <retn.txt> <yields.xlsx> scripts/catalog/data/factors`
   (inputs downloaded by hand into their own directory), read the diff, re-check section 3.
