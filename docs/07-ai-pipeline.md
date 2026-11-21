# 07 — AI Vision and Nutrition Engine

## 1. Core principle

**The model looks; the database counts.**

A vision model is good at recognizing food and reasonable at estimating
portions. It is unreliable at recalling nutrient values and at arithmetic.
So the model's only jobs are to name what is on the plate and estimate grams.
Every nutrient value comes from a food database through deterministic code.

What this buys: values are reproducible, traceable to a source, and
correctable by the user without another AI call.

What it does not buy: exactness. Estimating weight from a single photo is
the dominant source of error, and no pipeline removes it. The app presents
results as estimates and makes correction fast (document 04). Accuracy is
measured, not assumed (document 11).

## 2. Pipeline

```
 1 Capture ─▶ 2 Preprocess ─▶ 3 Vision call ─▶ 4 Validate ─▶ 5 Match ─▶ 6 Compute ─▶ 7 Review ─▶ 8 Save
```

| Step | What happens | Where |
| --- | --- | --- |
| 1. Capture | Photo from camera or gallery, plus an optional user hint | UI |
| 2. Preprocess | Downscale so the long edge is at most 1,024 px, re-encode as JPEG at about 80% quality. Re-encoding drops EXIF metadata, including location. | Device |
| 3. Vision call | One request to the active provider with the system prompt, the image, the hint, the locale, and the output schema | Provider |
| 4. Validate | Parse and validate against the Zod schema. On failure, one repair retry that sends the validation error back. On a second failure, stop with an error. | Device |
| 5. Match | Each detected item is matched to a catalog food | Device |
| 6. Compute | `nutrient = grams × value per 100 g ÷ 100` for every tracked nutrient | Device |
| 7. Review | The user confirms or corrects | UI |
| 8. Save | Meal, items, and nutrient snapshots are written in one transaction | Device |

The image-size limit is a starting value. The benchmark compares sizes for
accuracy against token cost before it is fixed.

## 3. Provider abstraction

No provider or model is hardcoded (D2). Three wire protocols cover nearly
every vision-capable service:

| Adapter | Covers |
| --- | --- |
| **OpenAI-compatible** (chat completions with image input, configurable base URL) | OpenAI, OpenRouter, Groq, Mistral, local servers such as Ollama and LM Studio, and any other compatible endpoint |
| **Anthropic Messages** | Claude models |
| **Google Gemini** | Gemini models through the Gemini API |

A provider **preset** is data, not code: display name, adapter, default base
URL, where to create a key, suggested models, cost and privacy notes, and a
"last verified" date. Presets live in one JSON file that is updated with
each release. Adding a provider that speaks one of the three protocols
needs no code change, and the user can always choose "Custom".

### Capability handling

Models differ in how they produce structured output. The adapter tries the
strongest method the profile supports and records what worked:

| Mode | Method | Used when |
| --- | --- | --- |
| A | Native structured output with a JSON Schema | The provider supports it |
| B | A single tool or function call whose parameters are the schema | Structured output is unavailable but tool calling works |
| C | Prompt-only JSON, then extract and validate | Neither is available, typical for small local models |

"Test connection" (FR-62) probes these in order with the bundled sample
image and stores the working mode on the profile, so later scans skip the
probing.

## 4. Output contract

The Zod schema is the single source of truth. The JSON Schema sent to
providers is generated from it.

```ts
const DetectedItem = z.object({
  name: z.string(),              // display name in the user's locale
  canonical_name_en: z.string(), // generic English name, e.g. "white rice, cooked"
  search_terms_en: z.array(z.string()).max(4),
  preparation: z.enum([
    "raw", "boiled", "steamed", "grilled", "baked",
    "fried", "sauteed", "stewed", "processed", "unknown",
  ]),
  grams: z.number().positive().max(2000),
  portion_basis: z.string(),     // short reasoning: "about one cup, compared with the fork"
  confidence_food: z.enum(["low", "medium", "high"]),
  confidence_portion: z.enum(["low", "medium", "high"]),
  fallback_per_100g: z.object({  // used only when no catalog match exists
    kcal: z.number().nonnegative(),
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
  }),
});

const ScanResult = z.object({
  is_food: z.boolean(),
  dish_name: z.string(),         // e.g. "Chicken with rice and salad"
  items: z.array(DetectedItem).max(20),
  hidden_ingredients_note: z.string(), // e.g. "likely cooked with oil"
});
```

Device-side checks after schema validation:

- `is_food` false or an empty `items` list ends the scan with "no food
  detected".
- Fallback values must be internally plausible: energy within a tolerance of
  `4 × protein + 4 × carbs + 9 × fat`. Otherwise the fallback is discarded
  and the item needs a manual match.
- Per-item and per-meal weight sanity limits flag, but do not block, extreme
  values.

## 5. Prompt

The prompt is versioned in the repository (`core/ai/prompt.ts`); the version
is stored with each scan. It is written in English regardless of the user's
language; the locale is passed as a parameter.

**System prompt (version 1, draft)**

```
You analyze a photo of a meal for a nutrition log.

Your job is to identify each distinct food and estimate how much of it is on
the plate. You do not calculate the meal's nutrition; a food database does
that from your output.

Identify foods
- List each visible food as its own item. Split composite dishes into their
  main components when they are visually separable (for example chicken,
  rice, salad). Keep a dish as one item when its components cannot be
  separated or weighed apart (for example lasagna, soup, a sandwich).
- Include sauces, dressings, cheese, and drinks you can see.
- For each item give a generic English name with its preparation, such as
  "chicken breast, grilled" or "white rice, cooked", because the database is
  searched in English. Add up to four alternative search terms.
- Give the display name in the user's language: {locale}.

Estimate portions
- Estimate the edible weight in grams as served (cooked weight for cooked
  food).
- Use visible references for scale: plate and bowl size, cutlery, hands,
  packaging. A standard dinner plate is about 26 cm across.
- State the basis of each estimate in a few words.
- If the user gives a hint about a food or an amount, trust it over what you
  see.

Be honest about uncertainty
- Rate your confidence in the food identity and in the portion separately.
- Do not invent items you cannot see. If cooking fat or oil is likely but
  not visible, mention it in the hidden ingredients note instead of adding
  an item.
- If the photo does not show food, set is_food to false and return no items.

Also give your best estimate of energy and macronutrients per 100 g for each
item. This is used only when the database has no match.

User hint: {hint_or_"none"}
```

The image and hint are user content. Text that appears inside a photo (for
example on packaging) is treated as part of the scene, not as instructions;
the schema and device-side validation bound what any response can do.

## 6. Food catalog and matching

### Data sources

| Source | Role | License | How it is used |
| --- | --- | --- | --- |
| **USDA FoodData Central** — Foundation Foods and SR Legacy | Primary catalog of generic foods with macro- and micronutrients | Public domain (CC0) | Bundled in the app as a prebuilt SQLite file; works offline |
| **Open Food Facts** | Packaged products by barcode | ODbL | Looked up on demand; results cached on the device; never bundled |
| **User's custom foods** | Anything missing | User's own | Stored locally |
| **AI fallback estimate** | Last resort when nothing matches | — | Marked "AI estimate" everywhere it appears |
| **BEDCA and other national tables** | Regional foods | Unverified (open question Q2) | Not used until the license is confirmed compatible |

The USDA catalog is in English. Spanish food names come from a translation
table maintained in the repository and open to community contributions; a
food with no translation is still found through its English name and the
model's English search terms.

A build script downloads the USDA files, keeps the tracked nutrients
(document 02, section 3), builds the full-text index, and writes
`catalog.db`. The script and the data version are recorded so the catalog
can be rebuilt and audited.

### Matching algorithm

1. Build a query from `canonical_name_en` and `search_terms_en`.
2. Search the FTS5 index (names and aliases) and take the top candidates.
3. Re-rank by: exact and prefix matches, agreement with `preparation` (a
   "grilled" item should not match a "raw" entry when a cooked one exists),
   preference for generic entries over branded ones, and the user's own
   history (foods this user confirmed before for the same name).
4. Accept the top candidate if its score passes a threshold; otherwise fall
   back to the AI estimate and mark the item for review.
5. Remember user corrections: when the user swaps food A for food B under a
   detected name, that mapping is stored and applied first next time.

Raw versus cooked matters because weight changes with cooking. The prompt
asks for weight as served, and the matcher prefers catalog entries in the
same state.

## 7. Recommendations engine

| Layer | Scope | Input | Network |
| --- | --- | --- | --- |
| **Rules** (FR-50) | MVP | Today's totals and targets | None |
| **Suggestions** (FR-51) | MVP | Remaining calories and macronutrients, goal, locale, optional dietary preferences | One text-only request to the user's provider |
| **Weekly summary** (FR-52) | Next | Seven-day aggregates | None for the numbers; optional request for wording |

Rules for the MVP, evaluated in priority order, with one shown at a time:

1. Protein well below target late in the day.
2. Calories remaining with a meal slot still empty.
3. Fiber low over the last three days.
4. Sodium high over the last three days.
5. Target reached: a neutral confirmation.

Wording follows document 05, section 8. No rule gives medical advice or
suggests eating below the safety floor.

## 8. Privacy of AI calls

- A scan sends the downscaled photo, the hint, and the locale. It sends no
  profile data, history, or identifiers.
- A suggestion request sends numbers and the goal, never photos.
- The destination is whatever the user configured. Each preset states the
  known data-use terms; for example, the Gemini free tier uses submitted
  content to improve Google's products.
- Local models keep everything on the user's network.

## 9. Failure handling

| Failure | Handling |
| --- | --- |
| Timeout (default 60 s, configurable for local models) | Error with retry |
| HTTP 401 or 403 | "Invalid key"; link to provider settings |
| HTTP 429 | "Limit reached"; show the reset time when the response reports it |
| HTTP 5xx or network error | One automatic retry after a short delay, then an error |
| Response fails validation twice | Error; the raw response is available in the redacted debug view |
| Model refuses or returns `is_food: false` | "No food detected" |

## 10. Changing the pipeline

Any change to the prompt, the schema, the image size, or the matcher must
be run through the benchmark (document 11) and its results recorded in the
pull request. The prompt version is bumped with every prompt change.
