# 01 — Product Vision

## Vision

Logging a meal should take one photo and one confirmation. Qbit Nutrition is
a free, open-source nutrition tracker that analyzes a photo of a plate with
the AI model the user chooses, and keeps every record on the user's own
device.

## The problem

- Manual food logging is slow. Searching a database and weighing each
  ingredient is the main reason people stop tracking.
- Photo-based trackers exist, but they are closed, subscription-based, and
  send meal photos and health data to the vendor's servers.
- Users cannot choose or inspect the AI model that estimates their intake,
  and cannot tell which numbers are measured and which are guessed.

## Target users

| Persona | Goal | What they need from the app |
| --- | --- | --- |
| **The pragmatic tracker** (primary). Adult who wants to lose fat or gain muscle and has abandoned manual trackers before. | Hit a daily calorie and protein target with minimal effort. | Photo logging in a few seconds, a clear "what is left today" view. |
| **The privacy-minded user.** Comfortable creating an API key or running a local model. | Track health data without handing it to a vendor. | Local storage, no account, full export, a choice of provider including self-hosted. |
| **The contributor.** Developer or nutrition enthusiast. | Improve prompts, translations, food data, or accuracy. | Readable architecture, a reproducible accuracy benchmark, a permissive license. |

Not a target: people who need clinical nutrition management (diabetes insulin
dosing, kidney disease, eating disorder recovery). The app states this
clearly; see document 12.

## Value proposition

> Take a photo, confirm, done. Your data stays on your phone, and you choose
> the AI.

Three pillars:

1. **Photo-first logging.** The camera is the main entry point. Manual search
   and barcode scanning are fallbacks, not the default path.
2. **Simplicity.** One daily screen answers "how am I doing today and what
   can I still eat?". Detail is available but never required.
3. **Ownership.** No account, no server, no tracking. The user holds the
   data, the API key, and the choice of model.

## Differentiators

| | Typical commercial photo tracker | Qbit Nutrition |
| --- | --- | --- |
| Price | Subscription | Free; the user pays their AI provider only if they exceed its free tier |
| AI model | Fixed, undisclosed | Any vision-capable model, including local ones |
| Data location | Vendor cloud | The device |
| Account | Required | None |
| Nutrient numbers | Often produced directly by the model | Looked up in a food database; the model only identifies food and estimates portions |
| Transparency | Closed | Open code, open prompts, public accuracy benchmark |

## Product principles

1. **Honest numbers.** Every value shows where it came from: database,
   product label, or AI estimate. Estimates from a photo are approximate and
   the app says so.
2. **Correcting is as fast as logging.** The AI will be wrong; fixing an item
   or a portion must take one or two taps.
3. **Works without AI.** With no provider configured, manual logging, goals,
   and history all work.
4. **Nothing leaves the device silently.** The only outgoing data is what the
   user triggers: a photo to their provider, a barcode lookup, an export.
5. **No guilt mechanics.** No streak pressure, no shaming copy, no
   "good" and "bad" foods.

## Success measures

There is no telemetry, so success is measured through the benchmark, manual
testing, and community signals.

| Measure | Target for 1.0 |
| --- | --- |
| Time from opening the camera to a saved meal, on a correct analysis | Under 15 seconds on a mid-range phone, excluding provider latency |
| Meals in the benchmark whose calorie estimate is within 20% of ground truth | At least 60% with the recommended free-tier model (see document 11) |
| Owner's own use | Logs every meal for 30 consecutive days without going back to another app |
| Setup | A new user with a free provider key completes onboarding and the first scan in under 5 minutes |

## Non-goals

- A social network, challenges, or coaching marketplace.
- Medical advice, diagnosis, or diet prescriptions.
- A hosted service, user accounts, or cloud sync run by the project.
- Meal plans, recipes, or grocery delivery in 1.0.
