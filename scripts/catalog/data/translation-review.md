## How the names are made

- **Handwritten and reviewed** (918 foods, 6.9 %): `translations.es.json`. They are chosen by a stated criterion (below), not by guesswork.
  685 were written or rewritten by hand (`food_name.origin = handwritten`: "Huevo, frito", "Café con leche", "Pechuga de pollo, a la plancha");
  233 are the composer's name, read and accepted by a person (`reviewed`). Reviewers should read these first.
- **Composed** (12,430 foods, 93.1 %): `compose.ts` splits the USDA description into comma segments, looks every word up in the bilingual
  glossary (`scripts/catalog/data/glossary/*.json`, about 3,100 English words and phrases), puts adjectives after their noun and makes them agree
  in gender and number, turns English noun compounds into "head de modifier", leads with the specific food of a USDA group chain
  ("Squash, summer, zucchini, includes skin" -> "Calabacín, con piel"), drops a trailing "NFS", names a meatless product as a substitute
  ("Sustituto vegetal de pollo"), keeps leg, drumstick and thigh apart, and keeps the capitalized words of a brand or product title as written
  while translating the lowercase generic words around them.
- **Selection criterion for the reviewed list** (`scripts/catalog/handwrittenSelection.ts`, reproducible from the built catalog): (1) every food a
  search puts in the top 3 and the everyday query set accepts (261 foods), and (2) the plain staples of every food group: in each USDA/WWEIA
  category the 3 generic foods (5 in the 60 largest categories) that are FNDDS first, then Foundation, then SR Legacy, then the shortest
  English description. 885 foods; a test checks the built catalog still has a reviewed name for (almost) all of them.
- **Neutral Spanish**, with regional synonyms as aliases (palta/aguacate, frutilla/fresa, choclo/maíz/elote, poroto/frijol/judía/alubia,
  zapallo/calabaza, banana/plátano/banano, durazno/melocotón, papa/patata, arveja/guisante/chícharo, ananá/piña, pomelo/toronja,
  manteca/mantequilla, carne picada/carne molida, panceta/tocino/beicon, and more in `synonyms.json`).

## What the sample shows (read by the author, all 200 rows)

The sample covers only composed names. I counted a first random sample (seed 20261122) while fixing the composer, then drew this one
(seed 20261123) with the fixed composer. Same strict reading both times: *natural* = a Spanish speaker would write it that way;
*stiff* = understandable but literal or long (USDA qualifier lists such as beef cuts, "calidad choice", "sólidos y líquidos");
*weak* = wrong, odd or misleading.

| | Natural | Stiff | Weak |
| --- | ---: | ---: | ---: |
| Before: the committed sample of the previous release (seed 20261121), re-read with this reading | 41 % | 40 % | 19 % |
| After: this sample, as first drawn (before a last round of fixes) | 43 % | 43 % | 14.5 % |
| After: this sample, after the fixes of the 11 rows that round touched (flattering: those rows were chosen because they were weak) | 46 % | 45 % | 9 % |

The "60 / 22 / 18" I reported with the previous release used a more lenient reading of "natural"; with the strict reading the same sample
is 41 / 40 / 19. The composed names improved a little (weak 19 % to 14.5 % on an unseen sample); what changed most for users is the 918
handwritten or reviewed foods, which are the ones that rank first for everyday searches.

Five names still weak in this sample: #2 `Bread, kneel down (Navajo)` -> "Pan, kneel abajo" (an untranslatable proper name read as words);
#44 `SUBWAY, sweet onion chicken teriyaki sub on white bread ...` (a long brand sandwich title, literal);
#96 `BURGER KING, CROISSAN'WICH with Sausage, Egg and Cheese` -> "... con Sausage, huevo y queso" (a capitalized generic word inside a brand title is kept);
#142 `Beef taco filling: beef, cheese, tomato, taco sauce` -> "Carne de res de relleno : de taco de carne de res, ..." (a colon list);
#154 `Roll, NS as to major flour` -> "Panecillo, harina sin especificar principal" (an uncommon FNDDS phrase).
