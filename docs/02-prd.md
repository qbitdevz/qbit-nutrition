# 02 — Product Requirements Document (PRD)

Requirements trace to the business contract in `bcdd/contrato.md` (REQ and
RN identifiers), which defines the agreed scope.

Scope labels: **MVP** ships in 1.0. **Next** is planned after 1.0. **Later**
is acknowledged but unscheduled. Phases are defined in
[document 10](10-mvp-roadmap.md).

## 1. Functional requirements

### 1.1 Onboarding and profile

| ID | Requirement | Scope |
| --- | --- | --- |
| FR-01 | The user picks English or Spanish on first launch; the default follows the device language. The language can be changed later. | MVP |
| FR-02 | The user must accept the health disclaimer before using the app (text in document 12). | MVP |
| FR-03 | The user can enter sex, birth date, height, weight, and activity level. Every field is optional; skipping leads to manually entered targets. | MVP |
| FR-04 | The user picks metric or imperial units. Storage is always metric. | MVP |

### 1.2 Goals

| ID | Requirement | Scope |
| --- | --- | --- |
| FR-10 | The user picks a goal: lose fat, maintain, or gain muscle. | MVP |
| FR-11 | The app proposes a daily calorie target and protein, carbohydrate, and fat targets from the profile (method in section 4). | MVP |
| FR-12 | The user can override any target by hand. Overridden targets are marked as custom. | MVP |
| FR-13 | Changing a goal starts a new goal period; earlier days keep the targets they had. | MVP |
| FR-14 | The app refuses to propose a target below a minimum daily energy and explains why (section 4). The user can adjust that minimum in Settings. | MVP |

### 1.3 Meal scanning

| ID | Requirement | Scope |
| --- | --- | --- |
| FR-20 | The user takes a photo or picks one from the gallery. | MVP |
| FR-21 | The user can add an optional text hint before analysis, for example "the rice is about 200 g" or "cooked in olive oil". | MVP |
| FR-22 | The app sends the photo to the configured provider and shows detected items, each with a name, an estimated weight in grams, and a confidence level. | MVP |
| FR-23 | Each detected item is matched to a food in the catalog. Nutrients are calculated from the catalog, not by the model. | MVP |
| FR-24 | On the review screen the user can change a portion, swap the matched food, remove an item, or add one. Totals update immediately. | MVP |
| FR-25 | An item with no catalog match shows the model's own per-100 g estimate, visibly marked as an AI estimate. | MVP |
| FR-26 | The user saves the result to a meal slot: breakfast, lunch, dinner, or snack. The slot is preselected from the time of day. | MVP |
| FR-27 | Every failure has a specific message and a way forward: no provider configured, no network, invalid key, quota exceeded, unreadable response, no food detected. Manual entry is always offered. | MVP |
| FR-28 | The user chooses whether photos are kept on the device after saving. The default keeps a compressed copy. | MVP |
| FR-29 | A scan that failed for lack of network is queued and can be retried from the meal list. | Next |

### 1.4 Manual logging

| ID | Requirement | Scope |
| --- | --- | --- |
| FR-30 | The user searches the bundled catalog in either language and adds a food with a portion in grams or a household measure. | MVP |
| FR-31 | Recent and favorite foods appear before search results. | MVP |
| FR-32 | The user can create a custom food with per-100 g values. | MVP |
| FR-33 | The user can copy a past meal to today. | MVP |
| FR-34 | The user scans a barcode and gets the packaged product from Open Food Facts. | MVP |
| FR-35 | The user can save a set of items as a reusable meal. | Next |

### 1.5 Dashboard and history

| ID | Requirement | Scope |
| --- | --- | --- |
| FR-40 | The daily dashboard shows calories consumed and remaining, the three macronutrients against their targets, and the day's meals. | MVP |
| FR-41 | The user can open any past day and edit or delete its meals. | MVP |
| FR-42 | A meal's detail view shows fiber, sugars, saturated fat, sodium, and the tracked micronutrients (section 3). | MVP |
| FR-43 | Weekly and monthly views show averages for calories and macronutrients against targets. | MVP |
| FR-44 | The user logs body weight; a chart shows the trend. | MVP |
| FR-45 | The user logs body measurements such as waist and hips and sees how they change over time. | MVP |

### 1.6 Recommendations

| ID | Requirement | Scope |
| --- | --- | --- |
| FR-50 | The dashboard shows at most one insight at a time, produced by local rules, for example "You still need 45 g of protein today". No AI call is involved. | MVP |
| FR-51 | The user can ask for food suggestions that fit what is left of the day. This uses the configured provider and sends only numeric totals and targets, never photos or history. | MVP |
| FR-52 | A weekly summary highlights patterns such as low fiber or protein below target on most days. | Next |

### 1.7 AI provider settings

| ID | Requirement | Scope |
| --- | --- | --- |
| FR-60 | The user adds a provider by choosing a preset or "custom", then entering an API key, a base URL where relevant, and a model identifier. | MVP |
| FR-61 | The model identifier is always editable free text. Where the provider exposes a model list, the app offers it as suggestions. | MVP |
| FR-62 | A "test connection" action sends a bundled sample image and reports whether the model can see images and return valid structured output. | MVP |
| FR-63 | Several provider profiles can be stored; one is active. | MVP |
| FR-64 | Each preset shows a short privacy and cost note, for example that a free tier may use submitted content for training. | MVP |
| FR-65 | The app shows token usage and an estimated cost per scan and per month when the provider reports usage. | Next |
| FR-66 | The user can set a second profile as an automatic fallback when the first one fails or runs out of quota. | Later |

### 1.8 Data ownership

| ID | Requirement | Scope |
| --- | --- | --- |
| FR-70 | The user exports all data as one file (JSON, with optional photos in a ZIP). API keys are never included. | MVP |
| FR-71 | The user imports a previous export on a new installation. | MVP |
| FR-72 | The user deletes all data from inside the app. | MVP |
| FR-73 | The user exports meals as CSV. | Next |
| FR-74 | The app writes nutrition records to Health Connect and reads body weight from it, with explicit permission. | MVP |
| FR-75 | Apple Health integration. | Later (with iOS) |
| FR-76 | Optional sync through a server the user hosts. | Later |

## 2. User stories and acceptance criteria

Only the stories that define the MVP are listed. Each maps to the
requirements above.

**US-1 — Log a meal by photo** (FR-20 to FR-26)
As a tracker, I want to photograph my plate and confirm the result, so that
logging takes seconds.

- Given a configured provider and a photo with food, the review screen lists
  at least one item with grams, calories, and macronutrients.
- Changing an item's grams updates the item and the meal totals without
  another AI call.
- Saving adds the meal to the selected slot and the dashboard totals change
  accordingly.
- Canceling on the review screen stores nothing in the meal history.

**US-2 — Correct the AI** (FR-24, FR-25)
As a tracker, I want to fix a wrong item quickly, so that I can trust my log.

- Swapping a food opens catalog search prefilled with the detected name.
- An item marked as an AI estimate keeps that mark after saving and in every
  later view.
- An item the user edited is marked as user-confirmed.

**US-3 — Use any AI provider** (FR-60 to FR-64)
As a privacy-minded user, I want to configure my own provider and model, so
that I control cost and where my photos go.

- A profile can be created for an OpenAI-compatible endpoint with a custom
  base URL, for the Anthropic API, and for the Gemini API.
- "Test connection" distinguishes these outcomes: success, invalid key,
  unknown model, model cannot read images, response not valid.
- The API key cannot be read back in the UI after saving, only replaced, and
  is absent from exports and logs.

**US-4 — Know where I stand today** (FR-40, FR-50)
As a tracker, I want one screen that shows what I have eaten and what is
left, so that I can decide my next meal.

- With no meals logged, the dashboard shows the full targets and a prompt to
  scan the first meal.
- Going over a target is shown neutrally, with the amount over and no
  alarming wording.

**US-5 — Track without AI** (FR-30 to FR-33)
As a user with no provider configured, I want to log by searching, so that
the app is still useful.

- Searching "pollo" in Spanish and "chicken" in English both return chicken
  entries.
- Search works with the device in airplane mode.

**US-6 — Take my data with me** (FR-70 to FR-72)
As a user changing phones, I want to export and import everything, so that I
do not lose my history.

- Importing an export into a fresh installation reproduces profile, goals,
  meals, weights, and custom foods; daily totals match the source device.
- After "delete all data", the app returns to first-launch state and no meal
  photo remains in app storage.

## 3. Tracked nutrients

| Group | Nutrients | Where shown |
| --- | --- | --- |
| Energy and macronutrients | Energy (kcal), protein, carbohydrate, fat | Everywhere |
| Macronutrient detail | Fiber, sugars, saturated fat | Meal and day detail |
| Minerals | Sodium, potassium, calcium, iron, magnesium, zinc | Meal and day detail |
| Vitamins | A, C, D, B12, folate | Meal and day detail |

Micronutrient values are shown as amounts. Comparison against reference
intakes is **Next**, because reference values differ by country, age, and
sex and need a cited source per region.

## 4. Target calculation

- **Resting energy:** Mifflin-St Jeor equation.
  Men: `10 × kg + 6.25 × cm − 5 × age + 5`.
  Women: `10 × kg + 6.25 × cm − 5 × age − 161`.
- **Daily energy:** resting energy multiplied by an activity factor chosen by
  the user (sedentary to very active).
- **Goal adjustment:** a percentage below maintenance for fat loss and above
  it for muscle gain. The user picks a pace (gentle, moderate); the
  percentages are constants defined in one place in the code.
- **Protein:** grams per kilogram of body weight, with a default that depends
  on the goal. Fat gets a minimum share of energy; carbohydrate takes the
  remainder.
- **Safety floor (FR-14):** the app does not propose targets below a minimum
  daily energy, which the user can adjust in Settings, and proposes none for users under 18 or users who
  indicate pregnancy or breastfeeding. Those users can still log food.

The specific constants (activity factors, deficit and surplus percentages,
protein per kilogram, minimum energy) must each cite a published guideline
in the code and in the in-app "how this is calculated" screen before the
first release. They are not fixed in this document on purpose.

## 5. Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-01 | **Offline.** Everything except AI analysis, barcode lookup, and model listing works without network. |
| NFR-02 | **Performance.** Cold start under 2 seconds and catalog search results under 200 ms on a mid-range Android phone. |
| NFR-03 | **Privacy.** No analytics, crash reporting, or advertising SDKs. Network requests go only to hosts the user configured or triggered. |
| NFR-04 | **Secrets.** API keys are stored in hardware-backed secure storage, never in the database, logs, or exports. |
| NFR-05 | **Accessibility.** WCAG 2.2 AA contrast, screen-reader labels on every control, touch targets of at least 48 dp, no information conveyed by color alone. |
| NFR-06 | **Localization.** No user-visible string is hardcoded; English and Spanish are complete at every release. |
| NFR-07 | **Compatibility.** Android 8.0 (API 26) and later. The code builds for iOS without platform-specific rewrites. |
| NFR-08 | **Data safety.** Schema migrations are forward-only and tested against a copy of a real database before release. |
| NFR-09 | **Cost.** Building, testing, and releasing the app requires no paid service. |

## 6. Out of scope for 1.0

Accounts and cloud sync, social features, meal plans and recipes, wearable
integrations, voice logging, restaurant menus, water and exercise tracking,
and any hosted AI proxy.
