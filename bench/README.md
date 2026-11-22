# Accuracy benchmark

Measures how far the AI pipeline is from a kitchen scale, using the same code
the app runs: `analyzeMeal` from `src/core/ai`, matching against
`catalog-build/catalog.db` with `src/core/catalog`, and nutrients computed with
`src/core/nutrition`. Specification: `docs/11-qa-and-ai-accuracy.md` part B.

```
npx tsx bench/run.ts --adapter openai_compatible --base-url https://… --model … [--subset smoke] [--delay-ms 4000]
```

Build the catalog first (`npm run catalog:build`) so `catalog-build/catalog.db` exists.

## Provider configuration

There is **no default** provider, base URL, or model (decision D2). Give them as flags or environment variables:

| Flag | Environment variable | Meaning |
| --- | --- | --- |
| `--adapter` | `BENCH_ADAPTER` | `openai_compatible`, `anthropic`, or `gemini` |
| `--base-url` | `BENCH_BASE_URL` | Provider base URL (HTTPS, or a local/private host) |
| `--model` | `BENCH_MODEL` | Model identifier |
| `--key-env NAME` | `BENCH_KEY_ENV` | Name of the environment variable that holds the API key. Default name: `BENCH_API_KEY`. If that variable is unset, requests go out without a key (local servers). |

The key itself is never accepted as a flag, and it is never written to the
cache, the results, the summary, or the logs.

Other options: `--subset smoke` (at most 15 meals, spread across categories), `--delay-ms N` (pause between
provider calls, to stay inside free-tier limits), `--timeout-s N`, `--output-mode schema|tool|prompt`,
`--offline` (score from the cache only, no provider call), `--data`, `--catalog`, `--cache-dir`, `--out-dir`,
`--max-image-bytes`. `npx tsx bench/run.ts --help` lists them.

## Data set layout

One folder per meal; the folder name is the meal id:

```
bench/data/meals/
  2026-01-12-lunch/
    photo.jpg
    meal.json
  2026-01-13-keyboard/        (a non-food photo)
    photo.jpg
    meal.json
```

`bench/data/private/` is gitignored for meals that must not be published.

### Photos

Save each photo as a JPEG with its **long edge at most 1,024 px**. The harness
sends the file exactly as stored: it does **not** resize (no image library is
installed), so benchmark results reflect the photo you saved. Files above
1 MiB (`--max-image-bytes`), or JPEGs whose header reports a long edge above
1,024 px, are rejected with a message naming the file. No faces or personal
details may appear.

### `meal.json` for a food photo

```json
{
  "is_food": true,
  "category": "separated_plate",
  "locale": "en",
  "hint": "no salt added",
  "items": [
    {
      "name": "chicken breast, grilled",
      "aliases": ["pollo a la plancha"],
      "grams": 120,
      "catalog_source_id": "171477",
      "also_acceptable": ["171478"]
    },
    { "name": "white rice, cooked", "grams": 180, "catalog_source_id": "168878" }
  ],
  "hidden_ingredients": [{ "name": "olive oil", "grams": 5, "catalog_source_id": "171413" }],
  "notes": "free text, ignored by the harness"
}
```

- `category`: `single_food`, `separated_plate`, `mixed_dish`, `sandwich_wrap`, `salad`, `soup`, `breakfast`, `snack_fruit`, `drink`, `packaged`, `restaurant`, or `regional`.
- `items`: what is visible. `name` is the English name; `aliases` are other names a model may use. `grams` is the weighed weight (cooked weight for cooked food).
- `catalog_source_id`: the `source_id` of the food in `catalog.db` (the USDA FDC id), written as text. It is what the item maps to and how true nutrients are computed. `also_acceptable` lists other catalog foods the matcher may pick and still be right.
- `hidden_ingredients` (optional): oil, butter, sauces mixed in. They count toward the true nutrients but not toward item recall.
- `hint` (optional): the text a user would type in the app; `locale` (`en` default, or `es`) is the app language sent to the model.
- Unknown keys are rejected, so typos fail loudly.

### `meal.json` for a non-food photo

```json
{ "is_food": false }
```

Include about 20 of these (docs/11 B.2). They measure the false-positive rate.

A malformed `meal.json`, a `catalog_source_id` that is not in the catalog, or a
missing photo stops the run before any provider call, with a message naming the file.
The example IDs above are placeholders: look up real ones in your `catalog.db`.

## Weighing protocol (docs/11 B.2)

1. Weigh every component on a kitchen scale (1 g resolution) before plating or while plating. Record **cooked** weights for cooked food.
2. Photograph the plate from above and from about 45 degrees, in the light where it is eaten. No special staging. (One `photo.jpg` per meal; pick the best one, or make two meals.)
3. Record item names, grams, the catalog food each maps to, and anything not visible (oil, butter, sauces mixed in).
4. True nutrients are computed from the catalog with the same code the app uses; you never type them.

Cover the categories in docs/11 B.2. Photos are your own and are released under
the open license chosen when the set is first published.

## What a run does

1. Validates every `meal.json` and photo, and resolves the ground-truth foods in the catalog.
2. For each meal, sends the photo through `analyzeMeal` (prompt version from `core`, one repair retry), or replays the cached answer.
3. Matches the detected items, computes nutrients (matched catalog food, or the model's own per-100 g values when nothing matched), and scores.
4. Writes `bench/results/results-<model>-v<prompt>.json` and rebuilds `bench/results/summary.md`.

**Cache.** Answers are stored in `bench/.cache/` (gitignored), keyed by image hash, model, prompt version, and the
request variant (adapter, output mode, locale, hint). Re-running costs no provider calls for cached meals, so you
can change the matcher and re-score for free, and an interrupted run **resumes** where it stopped. Provider and network
failures are not cached; they are retried on the next run. Delete a file in `bench/.cache/` to force a new call.

## Metrics

Item identification pairs detected and true items one to one by normalized name (the detected name, English name, or
search terms against the true name or an alias; the words of the shorter name must all appear in the other).

| Metric | Definition |
| --- | --- |
| Item precision / recall | paired items / detected items, paired items / true items, over food photos with a final answer |
| Portion error, bias | mean absolute and mean signed (predicted − true) / true grams, over paired items |
| Matching rate | paired items whose matched catalog food is the true one or listed in `also_acceptable` |
| Energy, protein, carbs, fat error | mean absolute percentage error of the meal totals, over meals with a valid scan |
| Within ±10% / ±20% | share of food photos whose energy is within the bound; a "no food" or unusable answer is a miss |
| Valid output | share of answers that parsed, on the first attempt and after the repair retry |
| Latency | median and 95th percentile (nearest rank), wall time of the whole call including the repair |
| Tokens per scan | mean input and output tokens, from the provider's usage report |
| No-food rate | "no food" replies on food photos (false negatives) and on non-food photos (should be high) |

Meals that fail for provider reasons (network, authentication, quota) are listed as `failed` and left out of every rate.
Known approximations: a "no food" reply counts as valid on the first attempt (the repair status is not exposed by
`core`); tokens are only known for valid scans.

## Report

`bench/results/summary.md` has one row per model and prompt version with the columns of docs/11 B.4 plus the data
set size. The summary is rebuilt from every results file in the folder. Never edit it by hand.

## Limitations

- No image resizing: photos must already be saved at a long edge of at most 1,024 px (docs/07 step 2 is not exercised, and the `--image-size` comparison of docs/11 B.3 is not available).
- The data set is empty until the owner adds meals (task T6); the harness is tested only with synthetic responses and the fixture catalog.
