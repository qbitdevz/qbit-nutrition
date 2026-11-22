## How the names are made

- **Composed** (99.2 %): `compose.ts` splits the USDA description into comma segments, looks every word up in the bilingual glossary
  (`scripts/catalog/data/glossary/*.json`, about 3,000 English words and phrases, plus 184 kept brand and proper names), puts adjectives after their noun and makes them agree in
  gender and number, turns English noun compounds into "head de modifier" ("peanut butter sandwich" -> "sándwich de crema de cacahuate"), and
  keeps ALL-CAPS brand and restaurant names as written. A word the glossary lacks stops the build, so no English word is silently shipped.
- **Handwritten** (0.8 %): `translations.es.json`, the most common foods, where a natural name matters ("Pechuga de pollo, a la plancha").
  Reviewers should check these first; the column `food_name.origin` says which is which (`handwritten`, `composed`, `synonym` for aliases).
- **Neutral Spanish**, with regional synonyms as aliases (palta/aguacate, frutilla/fresa, choclo/maíz/elote, poroto/frijol/judía/alubia,
  zapallo/calabaza, banana/plátano/banano, durazno/melocotón, papa/patata, arveja/guisante/chícharo, ananá/piña, pomelo/toronja,
  manteca/mantequilla, carne picada/carne molida, panceta/tocino/beicon, and more in `synonyms.json`). English aliases (french fries, ground beef,
  scrambled eggs, zucchini/courgette, eggplant/aubergine, cilantro/coriander, ...) come from `synonyms.json` and `aliases.json`.

## What the sample shows (read by the author of the composer, all 200 rows)

My own count, not a measurement: about 120 of the 200 (60 %) read naturally or acceptably, about 45 (22 %) are stiff but understandable
(long USDA qualifier lists such as beef cuts, "calidad choice", "sólidos y líquidos"), and about 35 (18 %) are weak or wrong. The weak ones come
from three causes: product and brand titles translated word by word, English constructions the rules do not know, and one-word choices
that suit one region only. Judge for yourself in the table; if a pattern bothers you, say which and the glossary or a rule gets fixed
once for the whole catalog instead of name by name.

Five weak examples from this sample:

1. #5 `Nabisco, Nabisco Snackwell's Fat Free Devil's Food Cookie Cakes` -> "Nabisco, Nabisco Snackwell's sin grasa del diablo alimento galleta pasteles" (a brand title translated word by word).
2. #12 `Squash, summer, zucchini, includes skin, frozen, unprepared` -> "Calabaza, verano, calabacín, ..." (a USDA group chain read literally; "calabacín congelado, con piel" would be natural).
3. #77 `Cheese, fresh, queso fresco` -> "Queso fresco queso fresco" (the description already contains the Spanish name).
4. #129 `Chicken leg, drumstick and thigh, ...` -> "Pierna de pollo, pierna y muslo" (drumstick and leg collapse to one Spanish word).
5. #154 `Chicken, meatless, NFS` -> "Pollo sin carne, sin especificar" (a vegetarian product named like the animal).
