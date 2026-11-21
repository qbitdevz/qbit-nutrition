# Qbit Nutrition

An open-source, local-first nutrition tracker for Android. Take a photo of
your plate, confirm what the AI detected, and the meal is logged. Your data
stays on your phone, and you choose the AI provider and model.

> **Status: early development.** Nothing is installable yet. The project is
> in phase 0 of its [roadmap](docs/10-mvp-roadmap.md).

> **Not medical advice.** Values estimated from a photo are approximate. See
> the [disclaimer](docs/12-legal-and-privacy.md).

## Principles

- **Photo-first.** One photo and one confirmation per meal.
- **Bring your own AI.** Any vision-capable model: hosted, free-tier, or
  running on your own computer. Configured inside the app.
- **The model looks; the database counts.** The AI identifies food and
  estimates portions. Nutrient values come from a food database.
- **Local-first.** No account, no server, no tracking.
- **Bilingual.** English and Spanish.

## Documentation

Start with the [documentation index](docs/README.md). The agreed scope lives
in the business contract, [`bcdd/contrato.md`](bcdd/contrato.md) (Spanish).

## License

[MIT](LICENSE). Food composition data: U.S. Department of Agriculture,
Agricultural Research Service, FoodData Central.
