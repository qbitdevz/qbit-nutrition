# Changelog

## 1.0.1 — 2026-11-22

Fixes a data-loss bug in 1.0.0 when changing your goal. Install it over 1.0.0; nothing needs to be redone.

### What was wrong in 1.0.0

Saving a goal could delete the goal you already had, instead of closing it the day before the new one:

- When the phone's date was behind the date your current goal started (a wrong date, or a clock reset), saving a goal deleted the current goal without telling you.
- A current goal that started before 2000 was deleted instead of closed, and the targets of every past day it covered were lost.

An export that had to leave a goal period out of the file only said so in a short note that did not say the days it covered would have no targets after a restore.

### Who is affected

Anyone on 1.0.0 who saved a goal while the phone's date was wrong, or whose goal started before 2000 (this can only happen after a wrong date). If neither happened, no data was affected. If you think it happened to you, your meals are intact; the goal period or its targets may be missing from your history.

### What changed

- Setting a goal never deletes the goal you have. The current goal is closed the day before the new one starts, whatever its date.
- If the current goal starts after the date on your phone, the app does not change it and tells you why, with both dates, so you can check the date and time settings. When the current goal starts beyond the latest day the app accepts, you can replace it after a confirmation that shows both dates and the goal's values.
- A new goal is never allowed to overlap the history of earlier goals.
- Export: a goal period left out of the file is now named with its dates, with a plain statement that the days it covered will have no targets after a restore, and a button to open the goal settings. Only a goal whose dates are out of range is left out; any other goal problem stops the export and names the goal.
- Export: a cached barcode product whose stored data is damaged is now counted among the entries left out, instead of disappearing without a note.
- Importing several food tables at once: if two files are identical and you leave out the first, the copy is selected instead of neither being imported.

## 1.0.0 — 2026-11-22

First public release. Android only.

### What it does

- Log a meal from a photo with the AI provider and model you choose; review and correct every item before saving.
- Log by hand: search 13,000 foods in English and Spanish, scan or type a barcode, create your own foods, copy a past meal.
- Daily targets suggested from your profile, with the method and sources shown; a daily summary with one rule-based insight.
- Progress: weekly and monthly averages, weight and body measurements with charts.
- Food suggestions on request, sending only the numbers left for the day.
- Import a food composition table from your own file (CSV or Excel) for personal use.
- Optional Health Connect integration: writes meals, reads weight.
- Export, restore, and delete all your data. No account, no server, no analytics.

### Known limits

- The accuracy of calorie estimates from photos has not been measured. Treat them as rough estimates.
- Used on one Android phone so far. Health Connect and barcode scanning with the camera have not been confirmed on a device.
- Many Spanish food names are composed from a glossary and read stiffly.
- The privacy link in Health Connect's permission screen opens the app's home screen instead of the policy.
- A scan that fails for lack of network is not queued for later.
- Not available on F-Droid: the barcode scanner depends on Google libraries.
- The privacy policy and health notice are drafts pending legal review.
