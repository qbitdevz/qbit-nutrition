# 03 — Sustainability and Cost Model

The original brief asked for a monetization and go-to-market plan. Decision
D1 (personal use, then open source) removes monetization, so this document
covers what replaces it: who pays for what, how the project stays at zero
cost, and how it reaches users.

## 1. Model

**Free and open source, bring your own key.** The project earns nothing and
operates nothing. Each user connects the app to an AI provider under their
own account.

| Party | Pays for | Amount |
| --- | --- | --- |
| Project owner and contributors | Development tools, builds, hosting of code and releases | Zero (section 2) |
| User | AI analysis of their photos | Zero on a provider free tier or a local model; otherwise per-scan cost paid to the provider (section 3) |

Voluntary donations (for example GitHub Sponsors) may be enabled later. No
feature will ever depend on them.

## 2. Project costs

| Need | Choice | Cost | Note |
| --- | --- | --- | --- |
| Source hosting, issues, releases | GitHub public repository | Free | |
| Continuous integration and release builds | GitHub Actions on a public repository, plus local Gradle builds | Free | Confirm current public-repository terms before relying on CI for releases. |
| Backend, database, storage | None (D5) | Zero | |
| Food data | USDA FoodData Central (bundled), Open Food Facts (on demand) | Free | Licenses in document 12. |
| Android distribution | APK on GitHub Releases; F-Droid later | Free | Android developer verification may add requirements (open question Q1). |
| Google Play | Not planned | US$25 one-time | Outside the zero-cost rule; needs an explicit owner decision. |
| iOS distribution | Not planned for now (D6) | Paid annual Apple membership | Without it, builds expire after 7 days on at most 3 devices. |
| AI calls during development and benchmarking | Free-tier keys and local models | Zero | The benchmark is sized to fit daily free limits (document 11). |

**Rule:** before adopting any service, check its current free limits from
the provider's own page, and do not add one that needs a payment method on
file.

## 3. User cost per scan

One scan is one request containing an image, the prompt, and a short
structured answer.

```
cost per scan = (input tokens × input price) + (output tokens × output price)
```

Illustrative example, not a quote. It assumes about 2,000 input tokens
(image plus prompt) and 400 output tokens, at a list price of US$0.30 per
million input tokens and US$2.50 per million output tokens, which a
secondary source reported for a small Gemini model in November 2026:

| | Calculation | Result |
| --- | --- | --- |
| One scan | 2,000 × 0.30 / 1,000,000 + 400 × 2.50 / 1,000,000 | About US$0.0016 |
| Four scans a day for a month | 120 × 0.0016 | About US$0.19 |

Image token counts differ a lot between providers and image sizes, so real
numbers must come from the provider's usage report. The app reads that
report after each scan and shows the running total (FR-65).

### Zero-cost paths for the user

| Path | What to know |
| --- | --- |
| Provider free tier (for example the Gemini API) | Daily request limits apply and are shown in the provider's console. On the Gemini free tier, submitted content is used to improve Google's products; the app says so in the preset (FR-64). |
| Free models on an aggregator (for example OpenRouter) | Low daily request caps; model availability changes without notice. |
| Local model (Ollama, LM Studio, or any OpenAI-compatible server on the user's network) | No per-scan cost and photos never leave the user's network. Accuracy depends on the model and hardware. |

### Cost controls in the app

- Photos are downscaled before upload (document 07), which lowers token use.
- One request per scan. Edits on the review screen never call the provider.
- Recommendations by local rules need no AI call (FR-50).
- The user can set a monthly scan count warning.

## 4. Reaching users

There is no marketing budget. Distribution follows the open-source path:

1. **Owner's own use.** Thirty days of daily logging is the first milestone.
2. **Public repository.** A README with screenshots, a five-minute setup
   guide for a free provider, and the accuracy benchmark results.
3. **GitHub Releases.** Signed APKs with release notes in both languages.
4. **F-Droid.** After the build is free of proprietary dependencies.
5. **Community posts** in self-hosting, open-source Android, and fitness
   communities, in English and Spanish.

## 5. What would change this model

| Trigger | Consequence |
| --- | --- |
| Demand for a setup with no API key | Would need a hosted proxy, which costs money per scan. Out of scope unless funded; it would be a separate, optional service. |
| Demand for multi-device sync | Covered by an optional self-hosted server (FR-76), never by a project-run cloud. |
| Publishing on Google Play or the App Store | One-time or annual fee; owner decision. |

## 6. Risks

| Risk | Mitigation |
| --- | --- |
| A provider removes or shrinks its free tier | Provider-agnostic design (D2); presets are data, updated per release; local models remain available. |
| Suggested model identifiers go stale | The model field is always editable; presets carry a "last verified" date. |
| Creating an API key is too hard for non-technical users | Step-by-step guide per preset with screenshots; "test connection" explains each failure in plain language. |
| Android sideloading becomes restricted | Track open question Q1; F-Droid and Play remain alternatives. |
