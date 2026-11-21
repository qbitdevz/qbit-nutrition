# 11 — QA and AI Accuracy Plan

Two different questions need two different methods:

- **Does the software work?** Deterministic tests with pass or fail.
- **How accurate are the estimates?** A benchmark that produces measurements
  to be tracked over time.

## Part A — Software quality

### A.1 Test levels

| Level | Tool | Covers | Runs |
| --- | --- | --- | --- |
| Unit | Jest | `core/nutrition` (nutrient math, targets, unit conversion, insights), `core/catalog` (ranking), `core/ai` (schema validation, repair, error mapping) | Every pull request |
| Adapter contract | Jest with recorded HTTP fixtures | Each provider adapter builds the right request and parses success, refusal, 401, 429, 5xx, and malformed bodies | Every pull request |
| Data | Jest against an in-memory SQLite | Repositories, transactions, export and import round trip, migrations | Every pull request |
| Component | React Native Testing Library | Review screen behavior, forms, empty and error states, accessible names | Every pull request |
| End to end | Maestro on an emulator | The flows in A.3, with a fake provider | Before each release |
| Manual | Checklist | Camera on a real device, real providers, accessibility with the screen reader | Before each release |

No test in CI calls a real AI provider. Adapters are tested against
fixtures; end-to-end tests use a local fake server that returns canned
responses, including failures.

### A.2 What must have unit tests

- Nutrient computation for a known food and weight, checked against
  hand-calculated values.
- Target proposal for each goal, and the three refusal cases: under 18,
  pregnancy or breastfeeding, and below the safety floor.
- Schema validation: a valid response, missing fields, wrong types, an
  out-of-range weight, extra text around JSON, and the repair path.
- Fallback plausibility check (energy versus macronutrients).
- Matching: preparation agreement, generic preferred over branded, and
  correction memory taking precedence.
- Local date handling across a time-zone change and around midnight.
- Export excludes API keys; import rejects an invalid file without writing.

### A.3 End-to-end flows

1. First launch: language, disclaimer, skip profile, manual targets, reach
   Today.
2. Manual log: search in Spanish, add a food, save, see totals change.
3. Scan, happy path: fake provider returns two items, change one portion,
   save.
4. Scan, each failure: no provider, invalid key, quota exceeded, invalid
   output, no food.
5. Edit and delete a past meal; totals for that day update.
6. Export, delete all data, import, and compare totals.
7. Upgrade: install the previous release with seeded data, install the new
   build over it, and verify data and totals.

### A.4 Release gates

A release is blocked unless all of these hold:

- CI is green.
- End-to-end flows pass on the oldest supported Android version and on a
  current one.
- The migration test (flow 7) passes.
- The manual checklist is completed on at least one physical device.
- English and Spanish have no missing keys (checked by a script).
- The benchmark shows no regression beyond the tolerance in B.6.
- No new dependency carries a license incompatible with MIT distribution,
  and none is an analytics, crash-reporting, or advertising SDK.

### A.5 Bug severity

| Severity | Definition | Rule |
| --- | --- | --- |
| Critical | Data loss or corruption, a leaked API key, wrong nutrient math | Blocks release; fixed with a regression test |
| Major | A main flow cannot be completed | Blocks release |
| Minor | A workaround exists | Scheduled |
| Cosmetic | Visual only | Scheduled |

## Part B — AI accuracy

### B.1 What is measured

The pipeline has three stages that fail differently, so each is measured on
its own as well as end to end:

| Stage | Question | Metric |
| --- | --- | --- |
| Identification | Did the model find the right foods? | Precision and recall of detected items against the ground-truth item list |
| Portion | For correctly identified foods, how far off is the weight? | Mean absolute percentage error of grams, and signed bias (systematic over- or under-estimation) |
| Matching | Given the right name, did the matcher pick an equivalent catalog food? | Share of items matched to an acceptable catalog entry |
| **End to end** | How far off are the meal's totals? | Mean absolute percentage error for energy and each macronutrient; share of meals within ±10% and ±20% of true energy |

Operational metrics, per model:

| Metric | Why |
| --- | --- |
| Valid-output rate, first attempt and after repair | Reliability of structured output |
| Median and 95th-percentile latency | Usability |
| Input and output tokens per scan | Cost |
| Refusal or "no food" rate on real food photos | False negatives |
| "No food" rate on non-food photos | False positives |

### B.2 Ground-truth data set

Built by the project, because licensing and measurement method must be
known.

**Protocol for each meal**

1. Weigh every component on a kitchen scale (1 g resolution) before plating
   or while plating. Record cooked weights for cooked food.
2. Photograph the plate from above and from about 45 degrees, in the light
   where it is eaten. No special staging.
3. Record: item names, grams, the catalog food each maps to, and anything
   not visible (oil, butter, sauces mixed in).
4. Compute true nutrients from the catalog with the same code the app uses.

**Composition target**

| Stage | Size | Content |
| --- | --- | --- |
| Phase 0 spike | About 30 meals | The owner's usual meals |
| 1.0 | At least 100 meals | Spread across the categories below |
| After 1.0 | Growing | Community contributions with the same protocol |

Categories to cover: single foods, separated plates (protein, starch,
vegetable), mixed dishes (stews, pasta, rice dishes), sandwiches and wraps,
salads with dressing, soups, breakfast items, snacks and fruit, drinks,
packaged food, restaurant-style plating, and regional dishes from Spanish-
and English-speaking countries. Also about 20 non-food photos.

Photos in the data set are the contributors' own and are released under an
open license chosen when the set is first published. No faces or personal
details may appear.

Public research data sets could widen coverage. None is used until its
license is confirmed to allow it (open question Q4).

### B.3 Harness

A command-line tool that imports `core/` directly, which is possible because
`core/` has no React or Expo dependencies (document 06):

```
npm run bench -- --provider <profile> --model <id> [--subset smoke] [--image-size 1024]
```

- Runs the real pipeline: preprocess, vision call, validate, match, compute.
- Caches raw responses by image, model, and prompt version, so re-scoring
  costs nothing and matcher changes can be evaluated without new calls.
- Writes a results file and a summary table.
- Respects free limits: a `smoke` subset of 15 meals for quick checks, a
  configurable delay between requests, and resumable runs.

### B.4 Report

One row per model and prompt version, committed under `bench/results/`:

| Model | Prompt | Item recall | Portion error | Energy error | Within ±20% | Valid output | Median latency | Tokens per scan |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

The README publishes the latest table. It is the basis for which models the
presets suggest, and it lets users choose with evidence.

### B.5 Initial targets

These are hypotheses for 1.0 with the recommended free-tier model. Phase 0
measures the real baseline; the targets are then revised and recorded.

| Metric | Target |
| --- | --- |
| Item recall | At least 85% |
| Meals within ±20% of true energy | At least 60% |
| Valid output after repair | At least 99% |
| "No food" on real food photos | At most 2% |
| Median latency | Under 10 seconds |

Published accuracy claims must come from this benchmark and must state the
model, the prompt version, and the data set size.

### B.6 Regression rule

A change to the prompt, schema, image size, matcher, or catalog must run
the full benchmark on the reference model. It is rejected if energy error
worsens by more than 2 percentage points or valid-output rate drops by more
than 1 point, unless the pull request justifies the trade.

### B.7 Experiments worth running early

| Question | Comparison |
| --- | --- |
| Does a larger image help enough to justify the tokens? | 768, 1,024, and 1,536 px |
| Does a second angle help? | One photo versus two |
| Does asking for the estimation basis improve portions? | With and without `portion_basis` |
| How much does a user hint help? | No hint versus a hint with one known weight |
| Are small local models usable? | Local vision models versus the hosted reference |

### B.8 Learning from real use, without telemetry

The app collects nothing. Two local, opt-in mechanisms exist instead:

- The Settings screen can show the user their own correction rate, computed
  from `scan.result_json` versus saved items (document 08).
- A user can export a single scan (photo, model output, their correction)
  as a file and attach it to an issue to contribute a test case.
