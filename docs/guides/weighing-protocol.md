# Contribute benchmark meals: the weighing protocol

The accuracy of the photo analysis has **not been measured yet**, and the benchmark needs meals whose real weights are
known. This guide shows how to weigh, photograph and describe a meal so it can be added to the data set.
[Versión en español](weighing-protocol.es.md).

The technical reference is [`bench/README.md`](../../bench/README.md) (file formats, metrics, how a run works) and
[`docs/11-qa-and-ai-accuracy.md`](../11-qa-and-ai-accuracy.md) part B (why and how much). This page is the short version for
people who are not developers. By contributing, you agree that your photos and files are released under the project's open
license, as [CONTRIBUTING.md](../../CONTRIBUTING.md) says.

## What you need

- A kitchen scale with **1 g resolution**.
- A phone camera, and the light where you normally eat. No special staging.
- Your own meals and your own photos. **No faces or personal details in any photo.**

## For each meal

1. **Weigh every component** on the scale, before plating or while plating. For cooked food, weigh it **cooked**. Write the
   number down for each item (for example "rice, cooked: 180 g").
2. **Photograph the plate** from above and from about 45 degrees. Choose the better photo for the data set (or make two meals
   of them). One photo per meal.
3. **Note what is not visible:** oil or butter used, sauces mixed in, dressing. They count toward the real nutrients but
   are not expected to be seen.
4. **Find the catalog food** that each item corresponds to (next section). You never type nutrient values: they are computed
   from the catalog with the same code the app uses.

Cover the variety listed in `docs/11` B.2: single foods, separated plates, mixed dishes (stews, pasta, rice), sandwiches and
wraps, salads with dressing, soups, breakfast, snacks and fruit, drinks, packaged food, restaurant-style plates and regional
dishes from Spanish- and English-speaking countries. **Also about 20 photos with no food** (a keyboard, a desk, an empty
plate): they measure how often the model invents food.

## The photo file

- A **JPEG**, long edge **at most 1,024 pixels**, **at most 1 MiB**. The tool does not resize photos, and rejects bigger
  ones with a message naming the file. Most phones have a "resize" option when you share or edit a photo.
- Name it `photo.jpg`.

## Find the catalog food

You need the `source_id` (the USDA FoodData Central id) of each food. Build the catalog once (`npm run catalog:build`, needs
the internet), then search it. With Node 22 or newer, from the repository folder:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('catalog-build/catalog.db',{readOnly:true});for(const r of db.prepare(\"SELECT f.source_id, n.name FROM food f JOIN food_name n ON n.food_id=f.id WHERE n.locale='en' AND n.name LIKE ? LIMIT 20\").all('%chicken%'))console.log(r.source_id, r.name)"
```

Change `chicken` to your food. Pick the entry that matches how you weighed it (raw, cooked, with or without skin). The IDs in
the examples of `bench/README.md` are placeholders; always take yours from your own search.

## The meal folder

One folder per meal under `bench/data/meals/`, named with the date and a short name, for example `2026-01-12-lunch`:

```
bench/data/meals/2026-01-12-lunch/
  photo.jpg
  meal.json
```

`meal.json` for a food photo:

```json
{
  "is_food": true,
  "category": "separated_plate",
  "locale": "en",
  "hint": "no salt added",
  "items": [
    { "name": "chicken breast, grilled", "aliases": ["pollo a la plancha"], "grams": 120, "catalog_source_id": "171477" },
    { "name": "white rice, cooked", "aliases": ["arroz blanco"], "grams": 180, "catalog_source_id": "168878" }
  ],
  "hidden_ingredients": [{ "name": "olive oil", "grams": 5, "catalog_source_id": "171413" }]
}
```

`name` is the English name of the food and `aliases` are other names a model may use. `category` is one of `single_food`, `separated_plate`, `mixed_dish`, `sandwich_wrap`, `salad`, `soup`, `breakfast`,
`snack_fruit`, `drink`, `packaged`, `restaurant`, `regional`. `hint` and `locale` (`en` or `es`) are optional: they are what you
would have typed in the app. For a photo with no food, the file is just `{ "is_food": false }`. Mistyped keys are rejected on
purpose, so a typo fails loudly. The full rules are in `bench/README.md`.

## Check your files, then send them

1. Check the folder without calling any AI service:
   `npx tsx bench/run.ts --adapter openai_compatible --base-url http://localhost:11434/v1 --model none --offline --out-dir ../bench-check --cache-dir ../bench-check/cache`
   It validates every `meal.json` and photo first and names the file that is wrong. With `--offline` it calls no AI service, and
   the two folders keep whatever it writes out of the repository (you can delete them).
2. Open a pull request following [CONTRIBUTING.md](../../CONTRIBUTING.md), or, if you are not comfortable with git, open an
   [issue](https://github.com/qbitdevz/qbit-nutrition/issues) and say you have meals to contribute.
3. Meals you do not want to publish can go in `bench/data/private/` (never committed); they stay on your computer.
