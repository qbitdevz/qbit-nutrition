# Qbit Nutrition

An open-source, local-first nutrition tracker for Android. Take a photo of your plate, confirm what the AI detected, and the
meal is logged. Your data stays on your phone, and you choose the AI provider and model. Available in English and Spanish.

> **Status: version 1.0.** The app has been installed and used on one Android phone by its maintainer, with an AI provider
> configured through OpenRouter. It is tested by about 2,200 automated tests, a type check, and lint. What is **not** established:
> **the accuracy of the photo analysis has not been measured** (the benchmark has no weighed meals yet; see
> [contributing meals](docs/guides/weighing-protocol.md)), it has been tried on a single device, and the privacy policy and
> health notice are **drafts pending legal review**. Treat calorie figures from photos as rough estimates.

> **Not medical advice.** Values estimated from a photo are approximate and can be wrong. See the
> [health notice](docs/12-legal-and-privacy.md).

## What exists now

- **Photo scan.** Photograph a meal; the model you configured lists the foods and portions; you confirm or fix each item. The
  model looks, the database counts: nutrients come from a bundled USDA food list, not from the model.
- **Manual logging.** Search the bundled list in English or Spanish, create your own foods, copy a past meal, or scan or type a
  barcode (looked up in Open Food Facts, one code at a time).
- **Your day.** Calories left, macros against your targets, targets suggested from standard formulas (with how they are
  calculated), weekly and monthly averages, and a weight and body-measurement log with charts.
- **Food suggestions on request.** Sends only the numbers you have left for the day, never photos or history.
- **Health Connect (optional, off by default).** Saves your meals to the Android health platform and reads your weight from
  it, with each permission separate.
- **Your data.** Export everything to a file, restore it on a new install, or delete it all. Nothing leaves the phone unless
  you choose to send it: a photo to the AI provider you set up, a barcode number to Open Food Facts, a file you export.
- **Bring your own AI.** Gemini, OpenRouter, OpenAI, Anthropic, a model on your own computer (Ollama), or any compatible
  service. Keys are stored in the phone's secure storage and never exported. No analytics, no account, no server.

## Try it

You need Node 26 (what CI uses) and npm.

```bash
npm install            # also writes the third-party license list for the About screen
npm run catalog:build  # builds the food list from public-domain USDA data (needs the internet once)
npm run preview        # browser preview at http://localhost:8082, in a phone-sized window
```

The browser preview is for looking at screens: it replaces the camera, file picker, secure storage, AI service and Health
Connect with development stand-ins, so it proves nothing about a phone. To run on Android you need JDK 17 and the Android
SDK, then `npx expo run:android` (a development build; Expo Go cannot load the native modules this app uses).

Checks: `npm run typecheck`, `npm run lint`, `npm test`. The app bundles for Android with
`npx expo export --platform android` (after `npm run catalog:build`).

## Set up an AI provider

- [Google Gemini, free tier](docs/guides/gemini-free-tier.md) ([español](docs/guides/gemini-free-tier.es.md))
- [A local model with Ollama](docs/guides/local-model-ollama.md) ([español](docs/guides/local-model-ollama.es.md))

## Principles

- **Photo-first.** One photo and one confirmation per meal.
- **Bring your own AI.** Any vision-capable model: hosted, free-tier, or running on your own computer.
- **The model looks; the database counts.** The AI identifies food and estimates portions. Nutrient values come from a food
  database.
- **Local-first.** No account, no server, no tracking.
- **Free.** No paid service is used by the project or required of you.
- **Bilingual.** English and Spanish.

## Documentation

Start with the [documentation index](docs/README.md). The agreed scope lives in the business contract,
[`bcdd/contrato.md`](bcdd/contrato.md) (Spanish). Also: the [privacy policy](PRIVACY.md) (draft),
[guides for people](docs/guides/README.md), [how a release is made](docs/release.md), and [CONTRIBUTING](CONTRIBUTING.md).

## License

[MIT](LICENSE). Food composition data: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central.
Product data: Open Food Facts, under the Open Database License. Third-party software licenses are listed in the app
(Settings → About → Open-source licenses).
