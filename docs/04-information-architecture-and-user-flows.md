# 04 — Information Architecture and User Flows

## 1. Navigation map

Two tabs, a central scan button between them, and Settings behind an icon
in the header. Everything else is one level deeper.

```
App
├── Onboarding (first launch only)
│   ├── Language
│   ├── Health disclaimer
│   ├── Profile (optional)
│   ├── Goal and targets
│   └── AI provider (optional)
│
├── Tab: Today
│   ├── Daily summary (calories, macronutrients, insight)
│   ├── Meals of the day
│   │   └── Meal detail → edit items, nutrients, photo
│   └── Day picker → any past day
│
├── [ Scan ]  (central button)
│   ├── Camera / gallery
│   ├── Analyzing
│   ├── Review and correct
│   └── Add manually → search, recents, favorites, custom food, barcode (Next)
│
├── Tab: Progress
│   ├── Week / month averages
│   ├── Weight chart → log weight
│   └── Measurements
│
└── Settings (header icon)
    ├── Profile and units
    ├── Goal and targets
    ├── AI providers → add, edit, test, set active
    ├── Photos (keep or discard)
    ├── Language
    ├── Data → export, import, delete all
    ├── Integrations → Health Connect
    └── About → disclaimer, privacy, licenses, data sources
```

## 2. Screen inventory

| Screen | Purpose | Primary action |
| --- | --- | --- |
| Today | Answer "how am I doing and what is left?" | Scan a meal |
| Camera | Capture the plate | Shutter |
| Analyzing | Show progress and allow cancel | Cancel |
| Review | Confirm or correct detected items | Save meal |
| Food search | Find a food by name | Add item |
| Meal detail | Inspect and edit a saved meal | Edit |
| Progress | See trends | Log weight |
| Provider setup | Connect an AI provider | Test connection |
| Data | Export, import, delete | Export |

## 3. Flow A — First launch

1. **Language.** Preselected from the device; one tap to continue.
2. **Disclaimer.** Short text and a required "I understand" action. Declining
   closes the app.
3. **Profile.** Sex, birth date, height, weight, activity. "Skip" is as
   visible as "Continue".
4. **Goal.** Lose fat, maintain, or gain muscle, then a pace. The proposed
   targets are shown with a "how this is calculated" link and can be edited.
   - If the profile was skipped: the user types targets directly.
   - If the user is under 18 or indicates pregnancy or breastfeeding: no
     proposal; the app explains why and offers manual targets or none.
5. **AI provider.** Presets, each with a cost and privacy note, plus "Custom"
   and "Set up later".
   - A preset opens its guide: where to create a key, paste it, pick a
     model, test.
6. **Today.** Empty state with a single prompt: "Scan your first meal".

## 4. Flow B — Scan a meal (main flow)

```
Today ──tap Scan──▶ Camera ──shutter──▶ Preview ──Analyze──▶ Analyzing
                      │                    │                     │
                      └─ gallery           └─ add a hint         ├─ success ─▶ Review ──Save──▶ Today
                                              retake             └─ failure ─▶ Error with next step
```

1. **Camera.** Full-screen viewfinder, shutter, gallery, flash. A one-line
   tip appears the first three times: "Whole plate in frame, from above".
2. **Preview.** The photo, an optional hint field, "Retake" and "Analyze".
3. **Analyzing.** The photo stays visible with a progress indicator and
   "Cancel". After 20 seconds a line explains that the provider is slow.
4. **Review.** The photo as a header strip, then one row per item:
   name, grams with − and + steppers, calories, and a confidence mark for
   low-confidence items. Totals stay pinned at the bottom with the meal
   slot selector and "Save".
5. **Save.** Returns to Today, where the new meal is highlighted briefly and
   the totals animate to their new values.

### Correcting on the Review screen

| The AI got wrong | The user does | Result |
| --- | --- | --- |
| The portion | Taps − / +, or taps the number and types grams, or picks a household measure | Item and totals recalculate locally |
| The food | Taps the name → search prefilled with the detected name → picks another | Item is replaced; grams are kept |
| It invented an item | Swipes the row away, or taps the remove control | Item removed, with a 5-second undo |
| It missed an item | Taps "Add item" → search | Item added at a default portion |
| Everything | Taps "Retake" or "Add manually" | Returns to the camera or opens search |

Items come in three visible states: **matched** (from the catalog),
**AI estimate** (no catalog match), and **confirmed** (the user edited it).

## 5. Flow C — Failure branches of a scan

Every error screen keeps the photo, states the cause in one sentence, and
offers a retry where it makes sense plus "Add manually".

| Cause | Message intent | Actions |
| --- | --- | --- |
| No provider configured | Photo analysis needs an AI provider | Set up provider · Add manually |
| No network | Cannot reach the provider | Retry · Add manually · Save photo for later (Next) |
| Invalid or revoked key | The provider rejected the key | Open provider settings |
| Quota or rate limit reached | The provider's limit was reached, with the reset time if reported | Retry later · Switch provider · Add manually |
| Model cannot read images | The selected model does not accept photos | Open provider settings |
| Response not usable after one automatic retry | The model's answer could not be read | Retry · Add manually |
| No food detected | No food found in this photo | Retake · Add manually |

## 6. Flow D — Manual logging

1. Scan button → "Add manually" (or long-press the Scan button).
2. Search screen opens with recents and favorites; typing filters the
   catalog as the user types, locally.
3. Tap a food → portion sheet (grams or household measure) → "Add".
4. Items collect in the same Review screen used by scanning → "Save".

## 7. Flow E — Configure a provider

1. Settings → AI providers → "Add".
2. Pick a preset or "Custom (OpenAI-compatible)".
3. Fields: display name, base URL (prefilled for presets), API key, model.
   The model field offers the provider's list when it can be fetched.
4. "Test connection" runs the bundled sample image and reports one of:
   works, invalid key, unknown model, no image support, unusable response.
5. "Save" and optionally "Set as active".

## 8. Flow F — Export and import

- **Export:** Settings → Data → Export → choose "with photos" or not → the
  system share sheet receives the file.
- **Import:** Settings → Data → Import → pick a file → the app shows what it
  contains and asks to **replace** current data (merge is Later) → confirm.
- **Delete all:** requires typing a confirmation word; then returns to
  first launch.

## 9. States every data screen must define

| State | Today | Progress | Food search |
| --- | --- | --- | --- |
| Empty | Full targets and "Scan your first meal" | "Log a few days to see trends" | Recents, or a hint to type |
| Loading | Skeleton for totals | Skeleton for charts | None needed; search is local |
| Error | Database error with "Export data" and "Report" | Same | "No results" with "Create custom food" |
| Partial | Some meals logged | Fewer than 7 days: show what exists, no averages | — |
